const { logAudit } = require('../utils/audit');
const {
  MOTIFS,
  STATUSES,
  DISCOUNT_TYPES,
  motifLabel,
  discountLabel,
  searchStudents,
  getStudentForSchool,
  listCases,
  getStudentFeeBalance,
  createCase,
  closeCase,
} = require('../services/socialCaseService');

function schoolOr403(req, res) {
  const school = req.user?.school;
  if (!school?.id) {
    res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    return null;
  }
  return school;
}

async function listPage(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const q = String(req.query.q || '').trim();
  const studentId = String(req.query.studentId || '').trim();
  const status = String(req.query.status || '').trim();

  const [cases, matches, selectedStudent] = await Promise.all([
    listCases({ schoolId: school.id, status, q: studentId ? '' : q }),
    searchStudents(school.id, q),
    studentId ? getStudentForSchool(school.id, studentId) : Promise.resolve(null),
  ]);

  let feeBalance = null;
  if (selectedStudent) {
    feeBalance = await getStudentFeeBalance({
      schoolId: school.id,
      studentId: selectedStudent.id,
    });
    if (feeBalance.status === 403) {
      return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    }
  }

  res.render('school/cas-sociaux', {
    user: req.user,
    school,
    q,
    status,
    cases,
    matches,
    selectedStudent,
    feeBalance: feeBalance?.ok ? feeBalance : null,
    motifs: MOTIFS,
    statuses: STATUSES,
    discountTypes: DISCOUNT_TYPES,
    motifLabel,
    discountLabel,
    error: req.query.error || null,
    success: req.query.success || null,
  });
}

async function createSocialCase(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const result = await createCase({ school, body: req.body || {} });
  if (result.status === 403 || result.error === 'forbidden') {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }
  if (!result.ok) {
    const studentQs = req.body?.studentId ? `&studentId=${encodeURIComponent(req.body.studentId)}` : '';
    return res.redirect(`/school/cas-sociaux?error=${result.error || 'data'}${studentQs}`);
  }

  await logAudit({
    action: 'social_case_create',
    entity: 'SocialCase',
    entityId: result.socialCase.id,
    user: req.user,
    ip: req.ip,
  });

  res.redirect('/school/cas-sociaux?success=created');
}

async function closeSocialCase(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const result = await closeCase({ schoolId: school.id, id: req.params.id });
  if (result.status === 403 || result.error === 'forbidden') {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  await logAudit({
    action: 'social_case_close',
    entity: 'SocialCase',
    entityId: result.socialCase?.id,
    user: req.user,
    ip: req.ip,
  });

  res.redirect('/school/cas-sociaux?success=closed');
}

module.exports = {
  listPage,
  createSocialCase,
  closeSocialCase,
};
