const prisma = require('../config/database');
const { logAudit } = require('../utils/audit');
const { TERMS, formatTermLabel } = require('../services/academicTerms');
const {
  MENTIONS,
  DECISIONS,
  THRESHOLDS,
  getCouncilBoard,
  saveCouncil,
  generateCouncilPdf,
} = require('../services/deliberationService');

function schoolOr403(req, res) {
  const school = req.user?.school;
  if (!school?.id) {
    res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    return null;
  }
  return school;
}

async function listClasses(schoolId) {
  return prisma.class.findMany({
    where: { schoolId },
    orderBy: { name: 'asc' },
  });
}

async function deliberationsPage(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const classes = await listClasses(school.id);
  const classId = String(req.query.classId || classes[0]?.id || '').trim();
  const term = String(req.query.term || 'T1').trim();

  let board = null;
  if (classId) {
    board = await getCouncilBoard({
      schoolId: school.id,
      classId,
      term,
      schoolYear: school.currentSchoolYear,
    });
    if (board.status === 403) {
      return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    }
  }

  res.render('school/deliberations', {
    user: req.user,
    school,
    classes,
    classId,
    term: board?.term || term,
    terms: TERMS,
    formatTermLabel,
    mentions: MENTIONS,
    decisions: DECISIONS,
    thresholds: THRESHOLDS,
    rows: board?.ok ? board.rows : [],
    klass: board?.ok ? board.class : null,
    error: req.query.error || (board && !board.ok ? board.error : null),
    success: req.query.success || null,
    readOnly: false,
  });
}

async function saveDeliberations(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const classId = String(req.body.classId || '').trim();
  const term = String(req.body.term || '').trim();
  const result = await saveCouncil({
    schoolId: school.id,
    classId,
    term,
    schoolYear: school.currentSchoolYear,
    body: req.body,
  });

  if (result.status === 403 || result.error === 'forbidden') {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }
  if (!result.ok) {
    return res.redirect(`/school/deliberations?classId=${encodeURIComponent(classId)}&term=${encodeURIComponent(term)}&error=${result.error || 'data'}`);
  }

  await logAudit({
    action: 'deliberation_save',
    entity: 'Deliberation',
    entityId: classId,
    user: req.user,
    ip: req.ip,
  });

  res.redirect(`/school/deliberations?classId=${encodeURIComponent(classId)}&term=${encodeURIComponent(result.term)}&success=1`);
}

async function deliberationsPv(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const classId = String(req.query.classId || '').trim();
  const term = String(req.query.term || 'T1').trim();
  const board = await getCouncilBoard({
    schoolId: school.id,
    classId,
    term,
    schoolYear: school.currentSchoolYear,
  });
  if (!board.ok) {
    const status = board.status || 403;
    return res.status(status).render('error', { message: 'Accès refusé', user: req.user });
  }

  return res.status(200).render('school/deliberations-pv', {
    user: req.user,
    school,
    klass: board.class,
    term: board.term,
    schoolYear: board.schoolYear,
    rows: board.rows,
    formatTermLabel,
    mentions: MENTIONS,
    decisions: DECISIONS,
  });
}

async function deliberationsPvPdf(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const classId = String(req.query.classId || '').trim();
  const term = String(req.query.term || 'T1').trim();
  const board = await getCouncilBoard({
    schoolId: school.id,
    classId,
    term,
    schoolYear: school.currentSchoolYear,
  });
  if (!board.ok) {
    return res.status(board.status || 403).render('error', { message: 'Accès refusé', user: req.user });
  }

  try {
    const { filepath, filename } = await generateCouncilPdf({
      school,
      klass: board.class,
      term: board.term,
      schoolYear: board.schoolYear,
      rows: board.rows,
    });
    return res.download(filepath, filename);
  } catch (err) {
    console.error(err);
    return res.redirect(`/school/deliberations?classId=${encodeURIComponent(classId)}&term=${encodeURIComponent(term)}&error=pdf`);
  }
}

async function teacherDeliberationsPage(req, res) {
  const teacher = req.user?.teacher;
  if (!teacher?.schoolId) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  const links = await prisma.teacherClass.findMany({
    where: { teacherId: teacher.id },
    include: { class: true },
  });
  const classes = links.map((l) => l.class).filter(Boolean)
    .sort((a, b) => String(a.name).localeCompare(b.name, 'fr'));
  const allowed = new Set(classes.map((c) => c.id));
  const classId = String(req.query.classId || classes[0]?.id || '').trim();
  const term = String(req.query.term || 'T1').trim();

  if (classId && !allowed.has(classId)) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  let board = null;
  if (classId) {
    board = await getCouncilBoard({
      schoolId: teacher.schoolId,
      classId,
      term,
      schoolYear: teacher.school?.currentSchoolYear,
    });
    if (board.status === 403) {
      return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    }
  }

  res.render('teacher/deliberations', {
    user: req.user,
    school: teacher.school,
    classes,
    classId,
    term: board?.term || term,
    terms: TERMS,
    formatTermLabel,
    mentions: MENTIONS,
    decisions: DECISIONS,
    thresholds: THRESHOLDS,
    rows: board?.ok ? board.rows : [],
    klass: board?.ok ? board.class : null,
    error: board && !board.ok ? board.error : null,
    success: null,
    readOnly: true,
  });
}

module.exports = {
  deliberationsPage,
  saveDeliberations,
  deliberationsPv,
  deliberationsPvPdf,
  teacherDeliberationsPage,
};
