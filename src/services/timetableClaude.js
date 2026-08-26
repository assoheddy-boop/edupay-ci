const Anthropic = require('@anthropic-ai/sdk');
const { validateInput, detectConflicts, VALID_DAYS } = require('./timetableAgent');

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_PARSE_ATTEMPTS = 2;

const SYSTEM_PROMPT = `Tu es le Responsable Pédagogique Virtuel d'EduConnect pour les établissements scolaires ivoiriens et francophones.

Ta mission : produire un emploi du temps hebdomadaire cohérent à partir des données fournies.

Règles impératives :
1. N'invente JAMAIS de professeurs, classes, matières ou salles absents des données d'entrée.
2. Respecte les contraintes horaires (jours ouvrés, heures début/fin, pause déjeuner, durée des créneaux).
3. Respecte les disponibilités des professeurs quand elles sont renseignées.
4. Chaque créneau doit avoir : jour (Lundi…Samedi), heure, heure_fin, matiere, professeur, salle.
5. Place exactement le nombre d'heures demandé (heures_semaine) par matière et par classe.
6. Évite les conflits : un professeur, une salle ou une classe ne peut pas être à deux endroits au même moment.
7. Optimise l'équilibre : répartir les matières sur la semaine, limiter les trous inutiles.
8. Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans commentaire, sans texte avant ou après.

Schéma JSON attendu :
{
  "classes": [{ "classe": "NomClasse", "emploi_du_temps": [{ "jour": "Lundi", "heure": "08:00", "heure_fin": "09:00", "matiere": "...", "professeur": "...", "salle": "..." }] }],
  "professeurs": [{ "professeur": "Nom", "emploi_du_temps": [...] }],
  "eleves": [{ "classe": "NomClasse", "emploi_du_temps": [...] }],
  "conflits": [],
  "suggestions": ["conseils pédagogiques en français"]
}

Les tableaux professeurs et eleves doivent refléter les mêmes créneaux que classes (eleves = copie par classe).
Ajoute des suggestions utiles en français (équilibre, matières difficiles le matin, etc.).`;

function isClaudeAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function extractJsonText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function isValidTime(value) {
  return typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value.trim());
}

function validateSlot(slot, errors, prefix) {
  if (!slot || typeof slot !== 'object') {
    errors.push(`${prefix} : créneau invalide.`);
    return;
  }
  if (!VALID_DAYS.includes(slot.jour)) {
    errors.push(`${prefix} : jour « ${slot.jour} » invalide.`);
  }
  if (!isValidTime(slot.heure)) {
    errors.push(`${prefix} : heure de début invalide.`);
  }
  if (slot.heure_fin != null && !isValidTime(slot.heure_fin)) {
    errors.push(`${prefix} : heure de fin invalide.`);
  }
  if (!slot.matiere?.trim()) errors.push(`${prefix} : matière manquante.`);
  if (!slot.professeur?.trim()) errors.push(`${prefix} : professeur manquant.`);
  if (!slot.salle?.trim()) errors.push(`${prefix} : salle manquante.`);
}

function validateClaudeOutput(parsed, input) {
  const errors = [];
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errors: ['Réponse Claude : JSON objet attendu.'] };
  }

  if (!Array.isArray(parsed.classes)) {
    errors.push('Champ « classes » manquant ou invalide.');
  }
  if (!Array.isArray(parsed.professeurs)) parsed.professeurs = [];
  if (!Array.isArray(parsed.eleves)) parsed.eleves = [];
  if (!Array.isArray(parsed.suggestions)) parsed.suggestions = [];
  if (!Array.isArray(parsed.conflits)) parsed.conflits = [];

  const inputClassNames = new Set((input.classes || []).map((c) => c.nom?.trim()).filter(Boolean));
  const inputProfNames = new Set((input.professeurs || []).map((p) => p.nom?.trim()).filter(Boolean));
  const inputRoomNames = new Set((input.salles || []).map((s) => s.nom?.trim()).filter(Boolean));

  for (const bloc of parsed.classes || []) {
    if (!bloc?.classe?.trim()) {
      errors.push('Une classe sans nom dans la réponse Claude.');
      continue;
    }
    if (inputClassNames.size && !inputClassNames.has(bloc.classe.trim())) {
      errors.push(`Classe inventée : « ${bloc.classe} ».`);
    }
    for (const slot of bloc.emploi_du_temps || []) {
      validateSlot(slot, errors, `Classe ${bloc.classe}`);
      if (slot?.professeur?.trim() && inputProfNames.size && !inputProfNames.has(slot.professeur.trim())) {
        errors.push(`Professeur inventé « ${slot.professeur} » pour ${bloc.classe}.`);
      }
      if (slot?.salle?.trim() && inputRoomNames.size && !inputRoomNames.has(slot.salle.trim())) {
        errors.push(`Salle inventée « ${slot.salle} » pour ${bloc.classe}.`);
      }
    }
  }

  const creneaux = (parsed.classes || []).reduce(
    (n, c) => n + (c.emploi_du_temps || []).length,
    0,
  );
  if (!creneaux) {
    errors.push('Aucun créneau placé dans la réponse Claude.');
  }

  return { ok: errors.length === 0, errors, output: parsed };
}

function buildTeacherAndStudentViews(classBlocks) {
  const teacherMap = {};
  for (const bloc of classBlocks) {
    for (const slot of bloc.emploi_du_temps || []) {
      const name = slot.professeur?.trim();
      if (!name) continue;
      if (!teacherMap[name]) teacherMap[name] = [];
      teacherMap[name].push({ ...slot, classe: bloc.classe });
    }
  }

  return {
    professeurs: Object.entries(teacherMap).map(([professeur, emploi_du_temps]) => ({
      professeur,
      emploi_du_temps,
    })),
    eleves: classBlocks.map(({ classe, emploi_du_temps }) => ({ classe, emploi_du_temps: emploi_du_temps || [] })),
  };
}

function finalizeOutput(parsed, validationWarnings = []) {
  const classBlocks = (parsed.classes || []).map((b) => ({
    classe: b.classe.trim(),
    emploi_du_temps: (b.emploi_du_temps || []).map((s) => ({
      jour: s.jour,
      heure: s.heure.trim(),
      heure_fin: (s.heure_fin || s.heure).trim(),
      matiere: s.matiere.trim(),
      professeur: s.professeur.trim(),
      salle: s.salle.trim(),
    })),
  }));

  const views = buildTeacherAndStudentViews(classBlocks);
  const output = {
    classes: classBlocks,
    professeurs: parsed.professeurs?.length ? parsed.professeurs : views.professeurs,
    eleves: parsed.eleves?.length ? parsed.eleves : views.eleves,
    conflits: [],
    suggestions: [...(parsed.suggestions || [])],
  };

  output.conflits = detectConflicts(output);
  if (output.conflits.length) {
    for (const c of output.conflits) {
      output.suggestions.push(`Résoudre : ${c.message}`);
    }
  }

  const creneaux = classBlocks.reduce((n, c) => n + c.emploi_du_temps.length, 0);
  return {
    ok: true,
    output,
    warnings: validationWarnings,
    stats: {
      classes: classBlocks.length,
      creneaux,
      conflits: output.conflits.length,
      unplaced: 0,
    },
  };
}

async function callClaude(client, inputJson, attempt) {
  const userMessage = attempt === 1
    ? `Génère l'emploi du temps pour cet établissement. Données :\n${JSON.stringify(inputJson, null, 2)}`
    : `Ta réponse précédente n'était pas un JSON valide conforme au schéma. Réponds UNIQUEMENT avec le JSON, sans markdown.\nDonnées :\n${JSON.stringify(inputJson, null, 2)}`;

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content?.find((b) => b.type === 'text');
  return textBlock?.text || '';
}

async function generateTimetableWithClaude(rawInput) {
  if (!isClaudeAvailable()) {
    return { ok: false, error: 'no_api_key', message: 'ANTHROPIC_API_KEY non configurée.' };
  }

  const validation = validateInput(rawInput);
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const input = validation.input;
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: REQUEST_TIMEOUT_MS,
  });

  let lastParseError = null;

  for (let attempt = 1; attempt <= MAX_PARSE_ATTEMPTS; attempt += 1) {
    try {
      const rawText = await callClaude(client, input, attempt);
      const jsonText = extractJsonText(rawText);
      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseErr) {
        lastParseError = parseErr.message;
        continue;
      }

      const shape = validateClaudeOutput(parsed, input);
      if (!shape.ok) {
        lastParseError = shape.errors.join(' ');
        continue;
      }

      const result = finalizeOutput(shape.output, validation.warnings);
      result.generationMode = 'claude';
      return result;
    } catch (err) {
      console.error('[timetable-claude] API error:', err?.message || err);
      return {
        ok: false,
        error: 'api_error',
        message: err?.message || 'Erreur API Claude.',
      };
    }
  }

  console.error('[timetable-claude] parse validation failed:', lastParseError);
  return {
    ok: false,
    error: 'parse_error',
    message: lastParseError || 'Réponse Claude invalide.',
  };
}

const CHAT_SYSTEM_PROMPT = `Tu es le Responsable Pédagogique Virtuel d'EduConnect pour les établissements scolaires ivoiriens et francophones.

Tu aides le directeur ou le responsable pédagogique à construire et optimiser un emploi du temps scolaire.

Tu peux :
- Expliquer comment répartir les matières sur la semaine (ex. matières difficiles le matin)
- Aider à définir des contraintes (horaires, pauses, disponibilités professeurs)
- Suggérer des volumes horaires par niveau (CM2, 6ème, etc.)
- Identifier des conflits potentiels dans les données saisies ou générées
- Proposer des ajustements concrets (changer un créneau, équilibrer les profs)

Règles :
1. Réponds toujours en français, de façon claire et concise.
2. Reste focalisé sur l'emploi du temps scolaire — pas de sujets hors contexte.
3. N'invente pas de professeurs, classes ou salles absents des données fournies.
4. Si des données de session sont fournies, base tes conseils dessus.
5. Utilise des listes ou étapes numérotées quand c'est utile.
6. Si l'utilisateur demande de générer l'emploi du temps, indique-lui d'utiliser le bouton « Générer l'emploi du temps » à l'étape Générer.`;

const MAX_CHAT_HISTORY = 20;

function buildChatContextBlock(input, output) {
  const parts = [];
  if (input) {
    parts.push('Données de saisie actuelles (inputJson) :\n' + JSON.stringify(input, null, 2));
  }
  if (output) {
    parts.push('Emploi du temps généré (outputJson) :\n' + JSON.stringify(output, null, 2));
  }
  return parts.join('\n\n');
}

function sanitizeChatHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_CHAT_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

async function chatWithClaude({ input, output, message, history = [] }) {
  if (!isClaudeAvailable()) {
    return { ok: false, error: 'no_api_key', message: 'Clé API non configurée.' };
  }

  const trimmed = (message || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'empty_message', message: 'Message vide.' };
  }

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: REQUEST_TIMEOUT_MS,
  });

  const contextBlock = buildChatContextBlock(input, output);
  const systemWithContext = contextBlock
    ? `${CHAT_SYSTEM_PROMPT}\n\n--- Contexte de la session ---\n${contextBlock}`
    : CHAT_SYSTEM_PROMPT;

  const priorMessages = sanitizeChatHistory(history);
  const apiMessages = [
    ...priorMessages.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: trimmed },
  ];

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: systemWithContext,
      messages: apiMessages,
    });

    const textBlock = response.content?.find((b) => b.type === 'text');
    const reply = textBlock?.text?.trim() || 'Je n\'ai pas pu formuler de réponse. Réessayez.';

    const updatedHistory = [
      ...priorMessages,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: reply },
    ].slice(-MAX_CHAT_HISTORY);

    return { ok: true, reply, history: updatedHistory };
  } catch (err) {
    console.error('[timetable-claude] chat error:', err?.message || err);
    return {
      ok: false,
      error: 'api_error',
      message: err?.message || 'Erreur API Claude.',
    };
  }
}

module.exports = {
  SYSTEM_PROMPT,
  CHAT_SYSTEM_PROMPT,
  isClaudeAvailable,
  extractJsonText,
  validateClaudeOutput,
  generateTimetableWithClaude,
  chatWithClaude,
  sanitizeChatHistory,
  MAX_CHAT_HISTORY,
};
