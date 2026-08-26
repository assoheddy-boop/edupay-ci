const prisma = require('../config/database');
const { VALID_DAYS, parseTime, formatTimeFromMinutes, ensureSubject } = require('../../services/TimetableService');

const DEFAULT_CONSTRAINTS = {
  jours: [...VALID_DAYS],
  heure_debut: '07:30',
  heure_fin: '17:00',
  pause_debut: '12:00',
  pause_fin: '14:00',
  duree_creneau: 60,
};

const STATUS_LABELS = {
  DRAFT: 'Brouillon',
  GENERATED: 'Généré',
  APPLIED: 'Appliqué',
};

function normalizeInput(raw = {}) {
  const contraintes = { ...DEFAULT_CONSTRAINTS, ...(raw.contraintes_ecole || raw.contraintes || {}) };
  return {
    contraintes_ecole: contraintes,
    salles: Array.isArray(raw.salles) ? raw.salles : [],
    professeurs: Array.isArray(raw.professeurs) ? raw.professeurs : [],
    classes: Array.isArray(raw.classes) ? raw.classes : [],
  };
}

function emptyInput() {
  return normalizeInput({});
}

function parseAvailabilitySlot(slot) {
  if (!slot || typeof slot !== 'string') return null;
  const parts = slot.split('-').map((s) => s.trim());
  if (parts.length !== 2) return null;
  const start = parseTime(parts[0]);
  const end = parseTime(parts[1]);
  if (start == null || end == null || start >= end) return null;
  return { start, end };
}

function teacherAvailable(prof, day, slotStart, slotEnd) {
  const dispos = prof.disponibilites?.[day];
  if (!dispos || !dispos.length) return true;
  return dispos.some((slot) => {
    const range = parseAvailabilitySlot(slot);
    return range && slotStart >= range.start && slotEnd <= range.end;
  });
}

function buildSlots(constraints) {
  const days = (constraints.jours || VALID_DAYS).filter((d) => VALID_DAYS.includes(d));
  const startMin = parseTime(constraints.heure_debut);
  const endMin = parseTime(constraints.heure_fin);
  const pauseStart = parseTime(constraints.pause_debut);
  const pauseEnd = parseTime(constraints.pause_fin);
  const duration = Number(constraints.duree_creneau) || 60;

  if (startMin == null || endMin == null || duration <= 0) return [];

  const slots = [];
  for (const day of days) {
    for (let t = startMin; t + duration <= endMin; t += duration) {
      if (pauseStart != null && pauseEnd != null && t < pauseEnd && t + duration > pauseStart) {
        continue;
      }
      slots.push({
        day,
        start: t,
        end: t + duration,
        startTime: formatTimeFromMinutes(t),
        endTime: formatTimeFromMinutes(t + duration),
      });
    }
  }
  return slots;
}

function validateInput(data) {
  const input = normalizeInput(data);
  const errors = [];
  const warnings = [];

  const { contraintes_ecole: c } = input;
  if (!c.jours?.length) errors.push('Au moins un jour ouvré est requis.');
  if (parseTime(c.heure_debut) == null) errors.push('Heure de début invalide.');
  if (parseTime(c.heure_fin) == null) errors.push('Heure de fin invalide.');
  if ((Number(c.duree_creneau) || 0) <= 0) errors.push('Durée de créneau invalide.');

  const slots = buildSlots(c);
  if (!slots.length && !errors.length) errors.push('Aucun créneau horaire généré avec ces contraintes.');

  if (!input.classes.length) {
    errors.push('Ajoutez au moins une classe avec des matières.');
  }

  let matiereCount = 0;
  for (const cls of input.classes) {
    for (const mat of cls.matieres || []) {
      if (mat.matiere?.trim()) matiereCount += 1;
    }
  }
  if (input.classes.length && matiereCount === 0) {
    errors.push('Chaque classe doit contenir au moins une matière.');
  }

  for (const salle of input.salles) {
    if (!salle.nom?.trim()) warnings.push('Une salle sans nom sera ignorée.');
  }

  for (const prof of input.professeurs) {
    if (!prof.nom?.trim()) errors.push('Chaque professeur doit avoir un nom.');
    if (!prof.matieres?.length) warnings.push(`Professeur « ${prof.nom || '?'} » : aucune matière renseignée.`);
  }

  for (const cls of input.classes) {
    if (!cls.nom?.trim()) errors.push('Chaque classe doit avoir un nom.');
    for (const mat of cls.matieres || []) {
      if (!mat.matiere?.trim()) errors.push(`Classe « ${cls.nom} » : matière manquante.`);
      const h = Number(mat.heures_semaine);
      if (!Number.isFinite(h) || h <= 0) {
        errors.push(`Classe « ${cls.nom} » — ${mat.matiere || '?'} : heures/semaine invalides.`);
      }
      if (!mat.professeur?.trim()) {
        warnings.push(`Classe « ${cls.nom} » — ${mat.matiere || '?'} : professeur non assigné.`);
      }
    }
  }

  const profNames = new Set(input.professeurs.map((p) => p.nom?.trim()).filter(Boolean));
  for (const cls of input.classes) {
    for (const mat of cls.matieres || []) {
      const profName = mat.professeur?.trim();
      if (profName && !profNames.has(profName)) {
        warnings.push(`Professeur « ${profName} » (classe ${cls.nom}) absent de la liste professeurs.`);
      }
    }
  }

  let totalDemand = 0;
  let totalSupply = slots.length * Math.max(input.classes.length, 1);
  for (const cls of input.classes) {
    for (const mat of cls.matieres || []) {
      totalDemand += Number(mat.heures_semaine) || 0;
    }
  }
  if (input.classes.length && totalDemand > slots.length * input.classes.length) {
    warnings.push(`Volume horaire total (${totalDemand}h) élevé par rapport aux créneaux disponibles.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    input,
    slotCount: slots.length,
    totalDemand,
    totalSupply,
  };
}

function pickRoom(salles, usedRooms, day, start, end) {
  const candidates = salles.filter((s) => s.nom?.trim());
  for (const salle of candidates) {
    const key = `${salle.nom}|${day}|${start}|${end}`;
    if (!usedRooms.has(key)) return salle.nom.trim();
  }
  return candidates[0]?.nom?.trim() || 'Salle 1';
}

function detectConflicts(schedule) {
  const conflits = [];
  const allSlots = [];

  for (const bloc of schedule.classes || []) {
    for (const slot of bloc.emploi_du_temps || []) {
      allSlots.push({ ...slot, classe: bloc.classe, type: 'classe' });
    }
  }

  for (let i = 0; i < allSlots.length; i += 1) {
    for (let j = i + 1; j < allSlots.length; j += 1) {
      const a = allSlots[i];
      const b = allSlots[j];
      if (a.jour !== b.jour) continue;
      const aStart = parseTime(a.heure);
      const aEnd = parseTime(a.heure_fin || a.heure) || (aStart != null ? aStart + 60 : null);
      const bStart = parseTime(b.heure);
      const bEnd = parseTime(b.heure_fin || b.heure) || (bStart != null ? bStart + 60 : null);
      if (aStart == null || bStart == null) continue;
      const overlap = aStart < bEnd && aEnd > bStart;

      if (overlap && a.classe === b.classe) {
        conflits.push({
          type: 'classe',
          message: `Conflit classe ${a.classe} le ${a.jour} (${a.heure} / ${b.heure}).`,
          details: { a, b },
        });
      }
      if (overlap && a.professeur && a.professeur === b.professeur) {
        conflits.push({
          type: 'professeur',
          message: `Conflit professeur ${a.professeur} le ${a.jour} (${a.heure} / ${b.heure}).`,
          details: { a, b },
        });
      }
      if (overlap && a.salle && a.salle === b.salle) {
        conflits.push({
          type: 'salle',
          message: `Conflit salle ${a.salle} le ${a.jour} (${a.heure} / ${b.heure}).`,
          details: { a, b },
        });
      }
    }
  }

  return conflits;
}

function generateTimetable(rawInput) {
  const validation = validateInput(rawInput);
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const input = validation.input;
  const slots = buildSlots(input.contraintes_ecole);
  const profByName = Object.fromEntries(
    input.professeurs.filter((p) => p.nom?.trim()).map((p) => [p.nom.trim(), p]),
  );

  const classSchedules = {};
  const teacherSchedules = {};
  const usedClassSlot = new Set();
  const usedTeacherSlot = new Set();
  const usedRooms = new Set();
  const suggestions = [];
  const unplaced = [];

  for (const cls of input.classes) {
    const className = cls.nom.trim();
    classSchedules[className] = [];

    for (const mat of cls.matieres || []) {
      const subject = mat.matiere?.trim();
      const profName = mat.professeur?.trim() || '';
      const prof = profByName[profName];
      const hoursNeeded = Number(mat.heures_semaine) || 0;
      let placed = 0;

      for (const slot of slots) {
        if (placed >= hoursNeeded) break;
        const classKey = `${className}|${slot.day}|${slot.start}`;
        if (usedClassSlot.has(classKey)) continue;

        if (prof && !teacherAvailable(prof, slot.day, slot.start, slot.end)) continue;

        if (profName) {
          const teacherKey = `${profName}|${slot.day}|${slot.start}`;
          if (usedTeacherSlot.has(teacherKey)) continue;
        }

        const room = pickRoom(input.salles, usedRooms, slot.day, slot.start, slot.end);
        const roomKey = `${room}|${slot.day}|${slot.start}|${slot.end}`;
        if (usedRooms.has(roomKey)) continue;

        const entry = {
          jour: slot.day,
          heure: slot.startTime,
          heure_fin: slot.endTime,
          matiere: subject,
          professeur: profName,
          salle: room,
        };

        classSchedules[className].push(entry);
        usedClassSlot.add(classKey);
        if (profName) usedTeacherSlot.add(`${profName}|${slot.day}|${slot.start}`);
        usedRooms.add(roomKey);

        if (!teacherSchedules[profName]) teacherSchedules[profName] = [];
        if (profName) teacherSchedules[profName].push({ ...entry, classe: className });

        placed += 1;
      }

      if (placed < hoursNeeded) {
        unplaced.push({ classe: className, matiere: subject, manquantes: hoursNeeded - placed });
        suggestions.push(
          `Classe ${className} — ${subject} : ${hoursNeeded - placed}h non placée(s). Élargir les disponibilités ou ajouter des créneaux.`,
        );
      }
    }
  }

  const classes = Object.entries(classSchedules).map(([classe, emploi_du_temps]) => ({
    classe,
    emploi_du_temps,
  }));

  const professeurs = Object.entries(teacherSchedules).map(([professeur, emploi_du_temps]) => ({
    professeur,
    emploi_du_temps,
  }));

  const eleves = classes.map(({ classe, emploi_du_temps }) => ({ classe, emploi_du_temps }));

  const output = { classes, professeurs, eleves, conflits: [], suggestions, unplaced };
  output.conflits = detectConflicts(output);

  if (output.conflits.length) {
    for (const c of output.conflits) {
      suggestions.push(`Résoudre : ${c.message}`);
    }
  }

  const creneaux = classes.reduce((n, c) => n + c.emploi_du_temps.length, 0);
  if (!classes.length || creneaux === 0) {
    return {
      ok: false,
      errors: [
        'Données insuffisantes pour générer un emploi du temps. Vérifiez les classes, matières et professeurs, puis enregistrez le brouillon avant de générer.',
      ],
      warnings: validation.warnings,
    };
  }

  return {
    ok: true,
    output,
    warnings: validation.warnings,
    stats: {
      classes: classes.length,
      creneaux,
      conflits: output.conflits.length,
      unplaced: unplaced.length,
    },
  };
}

function normalizeTeacherName(name) {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function resolveTeacherByName(schoolId, name) {
  const norm = normalizeTeacherName(name);
  if (!norm) return null;
  const teachers = await prisma.teacher.findMany({
    where: { schoolId },
    include: { user: true },
  });
  return teachers.find((t) => {
    const full = normalizeTeacherName(`${t.user?.lastName || ''} ${t.user?.firstName || ''}`);
    const reversed = normalizeTeacherName(`${t.user?.firstName || ''} ${t.user?.lastName || ''}`);
    return full === norm || reversed === norm;
  }) || null;
}

async function resolveClassByName(schoolId, name, schoolYear) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  return prisma.class.findFirst({
    where: {
      schoolId,
      schoolYear,
      OR: [{ name: trimmed }, { name: { contains: trimmed, mode: 'insensitive' } }],
    },
  });
}

async function applyToDatabase(schoolId, output, { schoolYear, replaceExisting = true } = {}) {
  if (!schoolId || !output?.classes?.length) {
    return { ok: false, error: 'data', message: 'Aucun emploi du temps à appliquer.' };
  }

  const conflicts = detectConflicts(output);
  if (conflicts.length) {
    return {
      ok: false,
      error: 'conflicts',
      message: `${conflicts.length} conflit(s) détecté(s). Corrigez avant d'appliquer.`,
      conflicts,
    };
  }

  const created = [];
  const skipped = [];
  const classIdsToReplace = new Set();

  for (const bloc of output.classes) {
    const cls = await resolveClassByName(schoolId, bloc.classe, schoolYear);
    if (!cls) {
      skipped.push({ classe: bloc.classe, reason: 'Classe introuvable dans EduConnect.' });
      continue;
    }
    classIdsToReplace.add(cls.id);

    for (const slot of bloc.emploi_du_temps || []) {
      const teacher = await resolveTeacherByName(schoolId, slot.professeur);
      if (!teacher) {
        skipped.push({ classe: bloc.classe, slot, reason: `Professeur « ${slot.professeur} » introuvable.` });
        continue;
      }

      const subject = await ensureSubject(schoolId, slot.matiere);
      if (!subject) {
        skipped.push({ classe: bloc.classe, slot, reason: `Matière « ${slot.matiere} » invalide.` });
        continue;
      }

      const endTime = slot.heure_fin || slot.heure;
      created.push({
        classId: cls.id,
        teacherId: teacher.id,
        subjectId: subject.id,
        dayOfWeek: slot.jour,
        startTime: slot.heure,
        endTime,
        room: slot.salle || null,
        schoolId,
      });
    }
  }

  if (!created.length) {
    return {
      ok: false,
      error: 'empty',
      message: 'Aucun créneau n\'a pu être mappé. Vérifiez les noms de classes et professeurs.',
      skipped,
    };
  }

  await prisma.$transaction(async (tx) => {
    if (replaceExisting && classIdsToReplace.size) {
      await tx.timetable.deleteMany({
        where: { classId: { in: [...classIdsToReplace] } },
      });
    }
    for (const row of created) {
      await tx.timetable.create({ data: row });
    }
  });

  return {
    ok: true,
    created: created.length,
    skipped,
    classes: [...classIdsToReplace],
  };
}

const SUBJECT_COLOR_COUNT = 12;

function formatSalleLabel(salle) {
  if (!salle) return '';
  const trimmed = String(salle).trim();
  if (!trimmed) return '';
  if (/^salle\s/i.test(trimmed)) return trimmed;
  return `Salle ${trimmed}`;
}

function formatTimeSlotLabel(heure, heureFin) {
  if (heureFin && heureFin !== heure) return `${heure} - ${heureFin}`;
  return heure || '';
}

function timeSlotSortKey(label) {
  const start = (label || '').split(' - ')[0]?.trim();
  const minutes = parseTime(start);
  return minutes != null ? minutes : 0;
}

function sortTimeSlotLabels(slots) {
  return [...new Set(slots)].sort((a, b) => timeSlotSortKey(a) - timeSlotSortKey(b));
}

function sortDayLabels(days) {
  const order = Object.fromEntries(VALID_DAYS.map((d, i) => [d, i]));
  return [...new Set(days)].sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99));
}

function subjectColorIndex(name) {
  let hash = 0;
  const s = String(name || '').toUpperCase();
  for (let i = 0; i < s.length; i += 1) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % SUBJECT_COLOR_COUNT;
}

function buildGridFromSlots(slots = []) {
  const daysSet = new Set();
  const timesSet = new Set();
  const cells = {};

  for (const slot of slots) {
    if (!slot?.jour || !slot?.heure) continue;
    const day = slot.jour;
    const timeKey = formatTimeSlotLabel(slot.heure, slot.heure_fin);
    daysSet.add(day);
    timesSet.add(timeKey);
    cells[`${timeKey}|${day}`] = {
      matiere: slot.matiere || '',
      professeur: slot.professeur || '',
      salle: formatSalleLabel(slot.salle),
      classe: slot.classe || '',
      colorIndex: subjectColorIndex(slot.matiere),
    };
  }

  return {
    days: sortDayLabels([...daysSet]),
    timeSlots: sortTimeSlotLabels([...timesSet]),
    cells,
  };
}

function buildGridFromOutput(outputJson = {}) {
  const classBlocks = (outputJson.classes?.length
    ? outputJson.classes
    : (outputJson.eleves || []).map((e) => ({ classe: e.classe, emploi_du_temps: e.emploi_du_temps || [] })));

  const byClass = classBlocks.map((bloc) => {
    const grid = buildGridFromSlots(bloc.emploi_du_temps || []);
    return {
      name: bloc.classe,
      label: bloc.classe,
      slotCount: (bloc.emploi_du_temps || []).length,
      ...grid,
    };
  });

  const byTeacher = (outputJson.professeurs || []).map((bloc) => {
    const grid = buildGridFromSlots(bloc.emploi_du_temps || []);
    return {
      name: bloc.professeur,
      label: bloc.professeur,
      slotCount: (bloc.emploi_du_temps || []).length,
      ...grid,
    };
  });

  const allDays = sortDayLabels([
    ...byClass.flatMap((g) => g.days),
    ...byTeacher.flatMap((g) => g.days),
  ]);
  const allTimeSlots = sortTimeSlotLabels([
    ...byClass.flatMap((g) => g.timeSlots),
    ...byTeacher.flatMap((g) => g.timeSlots),
  ]);

  return {
    byClass,
    byTeacher,
    days: allDays.length ? allDays : VALID_DAYS.slice(0, 5),
    timeSlots: allTimeSlots,
    hasData: byClass.some((g) => g.slotCount > 0) || byTeacher.some((g) => g.slotCount > 0),
  };
}

function parseInputFromForm(body) {
  let input = emptyInput();
  try {
    if (body.inputJson) {
      const parsed = typeof body.inputJson === 'string' ? JSON.parse(body.inputJson) : body.inputJson;
      input = normalizeInput(parsed);
    }
  } catch {
    return { ok: false, message: 'JSON d\'entrée invalide.' };
  }
  return { ok: true, input };
}

module.exports = {
  DEFAULT_CONSTRAINTS,
  STATUS_LABELS,
  VALID_DAYS,
  SUBJECT_COLOR_COUNT,
  emptyInput,
  normalizeInput,
  validateInput,
  buildSlots,
  buildGridFromOutput,
  buildGridFromSlots,
  formatSalleLabel,
  subjectColorIndex,
  generateTimetable,
  detectConflicts,
  applyToDatabase,
  parseInputFromForm,
  resolveTeacherByName,
  resolveClassByName,
};
