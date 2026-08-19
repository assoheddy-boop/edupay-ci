const prisma = require('../config/database');
const { TERMS, formatTermLabel } = require('../services/academicTerms');
const {
  RISK_THRESHOLDS,
  RISK_LABELS,
  SCHOOL_TOP_N,
  getRiskBoard,
} = require('../services/riskService');

function schoolOr403(req, res) {
  const school = req.user?.school;
  if (!school?.id) {
    res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    return null;
  }
  return school;
}

async function listSchoolClasses(schoolId) {
  return prisma.class.findMany({
    where: { schoolId },
    orderBy: { name: 'asc' },
  });
}

function renderBoard(res, view, extras) {
  return res.render(view, {
    terms: TERMS,
    formatTermLabel,
    thresholds: RISK_THRESHOLDS,
    labels: RISK_LABELS,
    schoolTopN: SCHOOL_TOP_N,
    ...extras,
  });
}

async function risquesPage(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const classes = await listSchoolClasses(school.id);
  const classId = String(req.query.classId || '').trim();
  const term = String(req.query.term || '').trim();

  const board = await getRiskBoard({
    schoolId: school.id,
    classId,
    term,
    schoolYear: school.currentSchoolYear,
  });

  if (board.status === 403 || board.error === 'forbidden') {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  return renderBoard(res, 'school/risques', {
    user: req.user,
    school,
    classes,
    classId,
    term: board.term || term || 'T1',
    rows: board.ok ? board.rows : [],
    klass: board.ok ? board.class : null,
    counts: board.counts || { ELEVE: 0, MOYEN: 0, FAIBLE: 0 },
    totalStudents: board.totalStudents || 0,
    truncated: Boolean(board.truncated),
    error: board && !board.ok ? board.error : null,
    readOnly: false,
    formAction: '/school/risques',
    deliberationsBase: '/school/deliberations',
  });
}

async function teacherRisquesPage(req, res) {
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
  const allowed = classes.map((c) => c.id);
  const classId = String(req.query.classId || '').trim();
  const term = String(req.query.term || '').trim();

  if (classId && !allowed.includes(classId)) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  const board = await getRiskBoard({
    schoolId: teacher.schoolId,
    classId,
    classIds: allowed,
    term,
    schoolYear: teacher.school?.currentSchoolYear,
  });

  if (board.status === 403 || board.error === 'forbidden') {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  return renderBoard(res, 'teacher/risques', {
    user: req.user,
    school: teacher.school,
    classes,
    classId,
    term: board.term || term || 'T1',
    rows: board.ok ? board.rows : [],
    klass: board.ok ? board.class : null,
    counts: board.counts || { ELEVE: 0, MOYEN: 0, FAIBLE: 0 },
    totalStudents: board.totalStudents || 0,
    truncated: Boolean(board.truncated),
    error: board && !board.ok ? board.error : null,
    readOnly: true,
    formAction: '/teacher/risques',
    deliberationsBase: '/teacher/deliberations',
  });
}

module.exports = {
  risquesPage,
  teacherRisquesPage,
};
