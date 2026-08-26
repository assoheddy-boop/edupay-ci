const prisma = require('../config/database');
const {
  emptyInput,
  normalizeInput,
  validateInput,
  generateTimetable,
  applyToDatabase,
  parseInputFromForm,
  buildGridFromOutput,
  STATUS_LABELS,
  VALID_DAYS,
  DEFAULT_CONSTRAINTS,
} = require('../services/timetableAgent');
const { generateTimetableWithClaude, isClaudeAvailable } = require('../services/timetableClaude');

function schoolFromUser(user) {
  return user?.school || user?.staffAssignments?.[0]?.school || null;
}

async function loadSession(id, schoolId) {
  return prisma.timetableGenerationSession.findFirst({
    where: { id, schoolId },
  });
}

async function index(req, res) {
  try {
    const school = schoolFromUser(req.user);
    if (!school) return res.redirect('/auth/login');

    const sessions = await prisma.timetableGenerationSession.findMany({
      where: { schoolId: school.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    res.render('school/timetable-agent/index', {
      title: 'Assistant emploi du temps',
      timetableAgentCss: true,
      user: req.user,
      modules: res.locals.modules,
      school,
      sessions,
      statusLabels: STATUS_LABELS,
      success: req.query.success || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error('[timetable-agent] index failed:', err?.message || err);
    return res.status(500).render('error', {
      message: 'Impossible d\'afficher l\'assistant emploi du temps. Réessayez ou contactez le support.',
      user: req.user,
    });
  }
}

async function newSession(req, res) {
  const school = schoolFromUser(req.user);
  if (!school) return res.redirect('/auth/login');

  const session = await prisma.timetableGenerationSession.create({
    data: {
      schoolId: school.id,
      userId: req.user.id,
      name: `Session ${new Date().toLocaleDateString('fr-FR')}`,
      inputJson: emptyInput(),
      schoolYear: school.currentSchoolYear || '2025-2026',
    },
  });

  return res.redirect(`/school/timetable-agent/${session.id}`);
}

async function show(req, res) {
  const school = schoolFromUser(req.user);
  if (!school) return res.redirect('/auth/login');

  const session = await loadSession(req.params.id, school.id);
  if (!session) {
    return res.status(404).render('error', { message: 'Session introuvable.', user: req.user });
  }

  const input = normalizeInput(session.inputJson || emptyInput());
  const output = session.outputJson || null;
  const validation = validateInput(input);
  const step = req.query.step || 'contraintes';

  const skipped = req.query.skipped ? Number(req.query.skipped) : 0;
  const timetableGrids = output ? buildGridFromOutput(output) : null;

  res.render('school/timetable-agent/show', {
    title: session.name,
    timetableAgentCss: true,
    school,
    session,
    input,
    output,
    timetableGrids,
    validation,
    step,
    statusLabels: STATUS_LABELS,
    validDays: VALID_DAYS,
    defaultConstraints: DEFAULT_CONSTRAINTS,
    claudeAvailable: isClaudeAvailable(),
    generationMode: output?.meta?.generationMode || null,
    success: req.query.success || null,
    error: req.query.error || null,
    skipped,
  });
}

async function saveDraft(req, res) {
  const school = schoolFromUser(req.user);
  if (!school) return res.status(403).render('error', { message: 'Accès refusé', user: req.user });

  const session = await loadSession(req.params.id, school.id);
  if (!session) {
    return res.status(404).render('error', { message: 'Session introuvable.', user: req.user });
  }

  const parsed = parseInputFromForm(req.body);
  if (!parsed.ok) {
    return res.redirect(`/school/timetable-agent/${session.id}?error=${encodeURIComponent(parsed.message)}`);
  }

  const name = (req.body.name || session.name || '').trim() || session.name;

  await prisma.timetableGenerationSession.update({
    where: { id: session.id },
    data: {
      name,
      inputJson: parsed.input,
      status: 'DRAFT',
      updatedAt: new Date(),
    },
  });

  const step = req.body.step ? `&step=${encodeURIComponent(req.body.step)}` : '';
  return res.redirect(`/school/timetable-agent/${session.id}?success=draft${step}`);
}

async function runGenerate(req, res) {
  const school = schoolFromUser(req.user);
  if (!school) return res.status(403).render('error', { message: 'Accès refusé', user: req.user });

  const session = await loadSession(req.params.id, school.id);
  if (!session) {
    return res.status(404).render('error', { message: 'Session introuvable.', user: req.user });
  }

  let input = normalizeInput(session.inputJson || emptyInput());
  if (req.body.inputJson != null && String(req.body.inputJson).trim() !== '') {
    const parsed = parseInputFromForm(req.body);
    if (!parsed.ok) {
      return res.redirect(`/school/timetable-agent/${session.id}?error=${encodeURIComponent(parsed.message)}&step=generer`);
    }
    input = parsed.input;
  }

  const preValidation = validateInput(input);
  if (!preValidation.ok) {
    await prisma.timetableGenerationSession.update({
      where: { id: session.id },
      data: { inputJson: input, updatedAt: new Date() },
    });
    const errMsg = preValidation.errors.join(' ');
    return res.redirect(`/school/timetable-agent/${session.id}?error=${encodeURIComponent(errMsg)}&step=generer`);
  }

  const useAi = req.body.mode === 'ai' || req.body.generationMode === 'ai';
  let result;
  let generationMode = 'deterministic';
  let fallbackReason = null;

  if (useAi && isClaudeAvailable()) {
    result = await generateTimetableWithClaude(input);
    if (result.ok) {
      generationMode = 'claude';
    } else {
      fallbackReason = result.error || result.message || 'claude_failed';
      console.warn('[timetable-agent] Claude fallback:', fallbackReason);
      result = generateTimetable(input);
      generationMode = 'deterministic';
    }
  } else {
    if (useAi && !isClaudeAvailable()) {
      fallbackReason = 'no_api_key';
    }
    result = generateTimetable(input);
  }

  if (!result.ok) {
    await prisma.timetableGenerationSession.update({
      where: { id: session.id },
      data: { inputJson: input, updatedAt: new Date() },
    });
    const errMsg = result.errors?.join(' ') || 'Génération impossible.';
    return res.redirect(`/school/timetable-agent/${session.id}?error=${encodeURIComponent(errMsg)}&step=generer`);
  }

  result.output.meta = {
    generationMode,
    ...(fallbackReason ? { fallbackReason } : {}),
    generatedAt: new Date().toISOString(),
  };

  await prisma.timetableGenerationSession.update({
    where: { id: session.id },
    data: {
      inputJson: input,
      outputJson: result.output,
      status: 'GENERATED',
      generatedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const successParam = generationMode === 'claude' ? 'generated-ai' : 'generated';
  return res.redirect(`/school/timetable-agent/${session.id}?success=${successParam}&step=resultats`);
}

async function applySession(req, res) {
  const school = schoolFromUser(req.user);
  if (!school) return res.status(403).render('error', { message: 'Accès refusé', user: req.user });

  const session = await loadSession(req.params.id, school.id);
  if (!session) {
    return res.status(404).render('error', { message: 'Session introuvable.', user: req.user });
  }

  if (!session.outputJson) {
    return res.redirect(`/school/timetable-agent/${session.id}?error=${encodeURIComponent('Générez d\'abord l\'emploi du temps.')}`);
  }

  const result = await applyToDatabase(school.id, session.outputJson, {
    schoolYear: session.schoolYear || school.currentSchoolYear,
    replaceExisting: req.body.replaceExisting !== '0',
  });

  if (!result.ok) {
    return res.redirect(`/school/timetable-agent/${session.id}?error=${encodeURIComponent(result.message)}&step=resultats`);
  }

  await prisma.timetableGenerationSession.update({
    where: { id: session.id },
    data: { status: 'APPLIED', appliedAt: new Date(), updatedAt: new Date() },
  });

  const skipped = result.skipped?.length ? `&skipped=${result.skipped.length}` : '';
  return res.redirect(`/school/timetable-agent/${session.id}?success=applied${skipped}&step=resultats`);
}

async function preview(req, res) {
  const school = schoolFromUser(req.user);
  if (!school) return res.status(403).json({ ok: false, error: 'Accès refusé' });

  const session = await loadSession(req.params.id, school.id);
  if (!session) return res.status(404).json({ ok: false, error: 'Session introuvable' });

  if (req.accepts('html')) {
    const gridViewMode = req.query.view === 'teacher' ? 'teacher' : 'class';
    return res.render('school/timetable-agent/preview', {
      title: `Emploi du temps — ${session.name}`,
      timetableAgentCss: true,
      user: req.user,
      modules: res.locals.modules,
      school,
      session,
      output: session.outputJson,
      timetableGrids: session.outputJson ? buildGridFromOutput(session.outputJson) : null,
      gridViewMode,
      input: normalizeInput(session.inputJson || emptyInput()),
      statusLabels: STATUS_LABELS,
      safeJson: require('../utils/safeJson').safeJson,
    });
  }

  return res.json({
    ok: true,
    session: {
      id: session.id,
      name: session.name,
      status: session.status,
    },
    input: session.inputJson,
    output: session.outputJson,
  });
}

async function deleteSession(req, res) {
  const school = schoolFromUser(req.user);
  if (!school) return res.status(403).render('error', { message: 'Accès refusé', user: req.user });

  const session = await loadSession(req.params.id, school.id);
  if (!session) {
    return res.status(404).render('error', { message: 'Session introuvable.', user: req.user });
  }

  await prisma.timetableGenerationSession.delete({ where: { id: session.id } });
  return res.redirect('/school/timetable-agent?success=deleted');
}

module.exports = {
  index,
  newSession,
  show,
  saveDraft,
  runGenerate,
  applySession,
  preview,
  deleteSession,
};
