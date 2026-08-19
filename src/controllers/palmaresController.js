const prisma = require('../config/database');
const { formatTermLabel } = require('../services/academicTerms');
const { seriesLabel } = require('../services/series');
const { ordinalFr } = require('../services/classement');
const {
  LIMIT_OPTIONS,
  BULLETIN_TERMS,
  parseLimit,
  parseByGender,
  parsePalmaresTerm,
  formatMoyenne,
  palmaresQuery,
  getPalmares,
  generatePalmaresPdf,
} = require('../services/palmaresService');

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

async function teacherClasses(teacher) {
  const links = await prisma.teacherClass.findMany({
    where: { teacherId: teacher.id },
    include: { class: true },
  });
  return links.map((l) => l.class).filter(Boolean)
    .sort((a, b) => String(a.name).localeCompare(b.name, 'fr'));
}

function readFilters(req, classes) {
  let classId = String(req.query.classId || '').trim();
  if (!classId && classes[0]) classId = classes[0].id;
  return {
    classId,
    term: parsePalmaresTerm(req.query.term),
    limit: parseLimit(req.query.limit),
    byGender: parseByGender(req.query.byGender),
  };
}

function viewLocals({
  user,
  school,
  classes,
  board,
  filters,
  basePath,
  printPath,
  pdfPath,
  error,
}) {
  const qs = palmaresQuery({
    classId: filters.classId,
    term: board?.term || filters.term,
    limit: board?.limit || filters.limit,
    byGender: board?.byGender || filters.byGender,
  });
  return {
    user,
    school,
    classes,
    classId: filters.classId,
    term: board?.term || filters.term,
    limit: board?.limit || filters.limit,
    byGender: Boolean(board?.byGender ?? filters.byGender),
    hasGender: board?.hasGender || false,
    hasSeries: board?.hasSeries || false,
    groups: board?.ok ? board.groups : [],
    schoolYear: board?.ok ? board.schoolYear : (school?.currentSchoolYear || ''),
    allClasses: board?.ok ? board.allClasses : filters.classId === 'all',
    terms: BULLETIN_TERMS,
    limitOptions: LIMIT_OPTIONS,
    formatTermLabel,
    formatMoyenne,
    seriesLabel,
    ordinalFr,
    basePath,
    printPath,
    pdfPath,
    qs,
    error: error || (board && !board.ok ? board.error : null),
  };
}

async function loadBoard({ school, filters, allowedClassIds }) {
  if (!filters.classId) {
    return { board: null, forbidden: false };
  }
  const board = await getPalmares({
    schoolId: school.id,
    classId: filters.classId,
    term: filters.term,
    schoolYear: school.currentSchoolYear,
    limit: filters.limit,
    byGender: filters.byGender,
    allowedClassIds,
  });
  if (board.status === 403 || board.error === 'forbidden') {
    return { board, forbidden: true };
  }
  return { board, forbidden: false };
}

async function palmaresPage(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const classes = await listClasses(school.id);
  const filters = readFilters(req, classes);
  const { board, forbidden } = await loadBoard({ school, filters });
  if (forbidden) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  return res.render('school/palmares', viewLocals({
    user: req.user,
    school,
    classes,
    board,
    filters,
    basePath: '/school/palmares',
    printPath: '/school/palmares/imprimer',
    pdfPath: '/school/palmares.pdf',
    error: req.query.error,
  }));
}

async function palmaresPrint(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const classes = await listClasses(school.id);
  const filters = readFilters(req, classes);
  const { board, forbidden } = await loadBoard({ school, filters });
  if (forbidden || !board?.ok) {
    return res.status(board?.status || 403).render('error', { message: 'Accès refusé', user: req.user });
  }

  return res.status(200).render('school/palmares-print', viewLocals({
    user: req.user,
    school,
    classes,
    board,
    filters,
    basePath: '/school/palmares',
    printPath: '/school/palmares/imprimer',
    pdfPath: '/school/palmares.pdf',
  }));
}

async function palmaresPdf(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const classes = await listClasses(school.id);
  const filters = readFilters(req, classes);
  const { board, forbidden } = await loadBoard({ school, filters });
  if (forbidden || !board?.ok) {
    return res.status(board?.status || 403).render('error', { message: 'Accès refusé', user: req.user });
  }

  try {
    const { filepath, filename } = await generatePalmaresPdf({ school, board });
    return res.status(200).download(filepath, filename);
  } catch (err) {
    console.error(err);
    return res.redirect(`/school/palmares?${palmaresQuery(filters)}&error=pdf`);
  }
}

async function teacherCtx(req, res) {
  const teacher = req.user?.teacher;
  if (!teacher?.schoolId) {
    res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    return null;
  }
  const classes = await teacherClasses(teacher);
  const school = teacher.school || { id: teacher.schoolId, currentSchoolYear: teacher.school?.currentSchoolYear };
  school.id = teacher.schoolId;
  return {
    school,
    classes,
    allowedClassIds: classes.map((c) => c.id),
  };
}

async function teacherPalmaresPage(req, res) {
  const ctx = await teacherCtx(req, res);
  if (!ctx) return;

  const filters = readFilters(req, ctx.classes);
  const { board, forbidden } = await loadBoard({
    school: ctx.school,
    filters,
    allowedClassIds: ctx.allowedClassIds,
  });
  if (forbidden) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  return res.render('teacher/palmares', viewLocals({
    user: req.user,
    school: ctx.school,
    classes: ctx.classes,
    board,
    filters,
    basePath: '/teacher/palmares',
    printPath: '/teacher/palmares/imprimer',
    pdfPath: '/teacher/palmares.pdf',
    error: req.query.error,
  }));
}

async function teacherPalmaresPrint(req, res) {
  const ctx = await teacherCtx(req, res);
  if (!ctx) return;

  const filters = readFilters(req, ctx.classes);
  const { board, forbidden } = await loadBoard({
    school: ctx.school,
    filters,
    allowedClassIds: ctx.allowedClassIds,
  });
  if (forbidden || !board?.ok) {
    return res.status(board?.status || 403).render('error', { message: 'Accès refusé', user: req.user });
  }

  return res.status(200).render('school/palmares-print', viewLocals({
    user: req.user,
    school: ctx.school,
    classes: ctx.classes,
    board,
    filters,
    basePath: '/teacher/palmares',
    printPath: '/teacher/palmares/imprimer',
    pdfPath: '/teacher/palmares.pdf',
  }));
}

async function teacherPalmaresPdf(req, res) {
  const ctx = await teacherCtx(req, res);
  if (!ctx) return;

  const filters = readFilters(req, ctx.classes);
  const { board, forbidden } = await loadBoard({
    school: ctx.school,
    filters,
    allowedClassIds: ctx.allowedClassIds,
  });
  if (forbidden || !board?.ok) {
    return res.status(board?.status || 403).render('error', { message: 'Accès refusé', user: req.user });
  }

  try {
    const { filepath, filename } = await generatePalmaresPdf({ school: ctx.school, board });
    return res.status(200).download(filepath, filename);
  } catch (err) {
    console.error(err);
    return res.redirect(`/teacher/palmares?${palmaresQuery(filters)}&error=pdf`);
  }
}

module.exports = {
  palmaresPage,
  palmaresPrint,
  palmaresPdf,
  teacherPalmaresPage,
  teacherPalmaresPrint,
  teacherPalmaresPdf,
};
