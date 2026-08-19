const prisma = require('../config/database');
const { TERMS, formatTermLabel } = require('../services/academicTerms');
const {
  todayIso,
  listSessions,
  getSession,
  createSession,
  getPrintBundle,
  getParentConvocations,
  getParentPrintBundle,
  generateConvocationPdf,
} = require('../services/convocationService');
const { examTypesForCycle, allowsNationalExam } = require('../utils/educationCycle');

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

async function listSubjects(schoolId) {
  return prisma.subject.findMany({
    where: { schoolId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

async function convocationsPage(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const [classes, subjects, sessions] = await Promise.all([
    listClasses(school.id),
    listSubjects(school.id),
    listSessions(school.id),
  ]);

  const classId = String(req.query.classId || '').trim() || (classes[0]?.id || '');

  return res.status(200).render('school/convocations', {
    user: req.user,
    school,
    classes,
    subjects,
    sessions,
    classId,
    date: String(req.query.date || todayIso()),
    startTime: String(req.query.startTime || '08:00'),
    subject: String(req.query.subject || ''),
    room: String(req.query.room || ''),
    examType: String(req.query.examType || 'BLANC'),
    term: String(req.query.term || 'T1'),
    examTypes: examTypesForCycle(school.educationCycle),
    terms: TERMS,
    formatTermLabel,
    error: req.query.error || null,
    success: req.query.success || null,
  });
}

async function createConvocation(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  if (String(req.body.examType || '').toUpperCase() === 'NATIONAL' && !allowsNationalExam(school.educationCycle)) {
    const classId = encodeURIComponent(String(req.body.classId || ''));
    return res.redirect(`/school/convocations?error=examType&classId=${classId}`);
  }

  const result = await createSession({
    schoolId: school.id,
    classId: req.body.classId,
    subject: req.body.subject,
    examType: req.body.examType,
    date: req.body.date,
    startTime: req.body.startTime,
    room: req.body.room,
    term: req.body.term,
    createdBy: req.user?.id,
  });

  if (!result.ok) {
    if (result.status === 403) {
      return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    }
    return res.redirect(`/school/convocations?error=${result.error || 'data'}`);
  }

  return res.redirect(`/school/convocations/${result.session.id}?success=1`);
}

async function convocationDetail(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const sheet = await getSession({ schoolId: school.id, id: req.params.id });
  if (!sheet.ok) {
    if (sheet.status === 403) {
      return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    }
    return res.redirect(`/school/convocations?error=${sheet.error || 'data'}`);
  }

  return res.status(200).render('school/convocation-detail', {
    user: req.user,
    school,
    session: sheet.session,
    klass: sheet.class,
    rows: sheet.rows,
    formatTermLabel,
    success: req.query.success || null,
  });
}

async function convocationPrint(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const bundle = await getPrintBundle({
    schoolId: school.id,
    id: req.params.id,
    studentId: req.query.studentId,
  });
  if (!bundle.ok) {
    if (bundle.status === 403) {
      return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    }
    return res.redirect(`/school/convocations?error=${bundle.error || 'data'}`);
  }

  return res.status(200).render('school/convocations-print', {
    user: req.user,
    school,
    session: bundle.session,
    klass: bundle.class,
    rows: bundle.rows,
    formatTermLabel,
  });
}

async function convocationPdf(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const bundle = await getPrintBundle({
    schoolId: school.id,
    id: req.params.id,
    studentId: req.query.studentId,
  });
  if (!bundle.ok) {
    if (bundle.status === 403) {
      return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    }
    return res.redirect(`/school/convocations?error=${bundle.error || 'data'}`);
  }

  try {
    const { filepath, filename } = await generateConvocationPdf({
      school,
      session: bundle.session,
      klass: bundle.class,
      rows: bundle.rows,
    });
    return res.download(filepath, filename);
  } catch (err) {
    console.error(err);
    return res.redirect(`/school/convocations/${req.params.id}?error=pdf`);
  }
}

async function parentConvocationsPage(req, res) {
  const parent = req.user?.parentProfile;
  if (!parent?.id) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  const groups = await getParentConvocations(parent.id);
  return res.status(200).render('parent/convocations', {
    user: req.user,
    groups,
    error: req.query.error || null,
  });
}

async function parentConvocationPrint(req, res) {
  const parent = req.user?.parentProfile;
  if (!parent?.id) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  const bundle = await getParentPrintBundle({
    parentId: parent.id,
    id: req.params.id,
    studentId: req.query.studentId,
  });
  if (!bundle.ok) {
    if (bundle.status === 403) {
      return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    }
    return res.redirect(`/parent/convocations?error=${bundle.error || 'data'}`);
  }

  return res.status(200).render('school/convocations-print', {
    user: req.user,
    school: bundle.school,
    session: bundle.session,
    klass: bundle.class,
    rows: bundle.rows,
    parentView: true,
  });
}

async function parentConvocationPdf(req, res) {
  const parent = req.user?.parentProfile;
  if (!parent?.id) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  const bundle = await getParentPrintBundle({
    parentId: parent.id,
    id: req.params.id,
    studentId: req.query.studentId,
  });
  if (!bundle.ok) {
    if (bundle.status === 403) {
      return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    }
    return res.redirect(`/parent/convocations?error=${bundle.error || 'data'}`);
  }

  try {
    const { filepath, filename } = await generateConvocationPdf({
      school: bundle.school,
      session: bundle.session,
      klass: bundle.class,
      rows: bundle.rows,
    });
    return res.download(filepath, filename);
  } catch (err) {
    console.error(err);
    return res.redirect('/parent/convocations?error=pdf');
  }
}

module.exports = {
  convocationsPage,
  createConvocation,
  convocationDetail,
  convocationPrint,
  convocationPdf,
  parentConvocationsPage,
  parentConvocationPrint,
  parentConvocationPdf,
};
