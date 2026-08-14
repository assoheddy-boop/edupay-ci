const prisma = require('../config/database');
const { logAudit } = require('../utils/audit');
const { loadOrganization, schoolInOrg } = require('../utils/group');
const {
  requestTransfer,
  approveTransfer,
  rejectTransfer,
  completeTransfer,
  listTransfersForParent,
  listTransfersForSchool,
  listAllTransfers,
  getTransferStats,
} = require('../../services/TransferService');

const ERRORS = {
  student: 'Élève introuvable.',
  parent: 'Cet élève n\'est pas lié à votre compte.',
  school: 'École d\'accueil introuvable.',
  same_school: 'Choisissez une école différente de l\'école actuelle.',
  pending: 'Une demande de transfert est déjà en cours pour cet élève.',
  status: 'Cette demande ne peut plus être traitée.',
  forbidden: 'Vous n\'êtes pas autorisé à traiter cette demande.',
  class: 'Choisissez une classe dans l\'école d\'accueil.',
  matricule: 'Un élève avec le même matricule existe déjà dans l\'école d\'accueil.',
  data: 'Données invalides.',
};

function failRedirect(res, base, error) {
  const code = error && ERRORS[error] ? error : 'data';
  return res.redirect(`${base}?error=${code}`);
}

async function parentPage(req, res) {
  const parent = req.user.parentProfile;
  const children = parent
    ? await prisma.parentStudent.findMany({
      where: { parentId: parent.id },
      include: {
        student: { include: { class: true, school: true } },
      },
    })
    : [];

  const [schools, transfers] = await Promise.all([
    prisma.school.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, city: true } }),
    listTransfersForParent(req.user.id),
  ]);

  res.render('parent/transfer', {
    user: req.user,
    children,
    schools,
    transfers,
    error: req.query.error || null,
    success: req.query.success || null,
    errors: ERRORS,
  });
}

async function request(req, res) {
  const parent = req.user.parentProfile;
  if (!parent) return failRedirect(res, '/transfer', 'parent');

  const result = await requestTransfer({
    studentId: req.body.studentId,
    toSchoolId: req.body.toSchoolId,
    reason: req.body.reason,
    requestedById: req.user.id,
    parentProfileId: parent.id,
  });

  if (!result.ok) return failRedirect(res, '/transfer', result.error);
  await logAudit({
    action: 'transfer_request',
    entity: 'TransferRequest',
    entityId: result.transfer?.id,
    user: req.user,
    ip: req.ip,
    details: { studentId: req.body.studentId, toSchoolId: req.body.toSchoolId },
  });
  return res.redirect('/transfer?success=1');
}

async function schoolPage(req, res) {
  const schoolId = req.user.school?.id;
  const [transfers, classes, stats] = await Promise.all([
    listTransfersForSchool(schoolId),
    prisma.class.findMany({
      where: { schoolId },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    }),
    getTransferStats(schoolId),
  ]);

  res.render('school/transferRequests', {
    user: req.user,
    schoolId,
    transfers,
    classes,
    stats,
    error: req.query.error || null,
    success: req.query.success || null,
    errors: ERRORS,
  });
}

async function approve(req, res) {
  const schoolId = req.user.school?.id;
  const result = await approveTransfer({
    id: req.params.id,
    schoolId,
    classId: req.body.classId || null,
    note: req.body.note,
  });
  if (!result.ok) return failRedirect(res, '/transfer/requests', result.error);
  await logAudit({
    action: 'transfer_approve',
    entity: 'TransferRequest',
    entityId: req.params.id,
    user: req.user,
    schoolId,
    ip: req.ip,
  });
  return res.redirect('/transfer/requests?success=approved');
}

async function reject(req, res) {
  const schoolId = req.user.school?.id;
  const result = await rejectTransfer({
    id: req.params.id,
    schoolId,
    note: req.body.note,
  });
  if (!result.ok) return failRedirect(res, '/transfer/requests', result.error);
  await logAudit({
    action: 'transfer_reject',
    entity: 'TransferRequest',
    entityId: req.params.id,
    user: req.user,
    schoolId,
    ip: req.ip,
  });
  return res.redirect('/transfer/requests?success=rejected');
}

async function adminPage(req, res) {
  const [transfers, schools, genderStats] = await Promise.all([
    listAllTransfers(),
    prisma.school.findMany({
      include: { classes: { orderBy: [{ level: 'asc' }, { name: 'asc' }] } },
      orderBy: { name: 'asc' },
    }),
    getTransferStats(),
  ]);

  const stats = {
    pending: transfers.filter((t) => t.status === 'PENDING').length,
    approved: transfers.filter((t) => t.status === 'APPROVED').length,
    rejected: transfers.filter((t) => t.status === 'REJECTED').length,
    completed: transfers.filter((t) => t.status === 'COMPLETED').length,
    boysTransferred: genderStats.boysTransferred,
    girlsTransferred: genderStats.girlsTransferred,
    totalTransferred: genderStats.totalTransferred,
  };

  const classesBySchool = {};
  schools.forEach((school) => {
    classesBySchool[school.id] = school.classes;
  });

  res.render('admin/transferDashboard', {
    user: req.user,
    transfers,
    stats,
    classesBySchool,
    error: req.query.error || null,
    success: req.query.success || null,
    errors: ERRORS,
  });
}

async function canAccessSchoolTransferStats(req, schoolId) {
  if (req.user.role === 'SUPER_ADMIN') return true;
  if (req.user.role === 'SCHOOL_ADMIN') return req.user.school?.id === schoolId;
  if (req.user.role === 'ORGANIZATION_ADMIN') {
    const organization = await loadOrganization(req);
    return Boolean(organization && schoolInOrg(organization, schoolId));
  }
  return false;
}

async function stats(req, res) {
  const { schoolId } = req.params;
  if (!schoolId) return res.status(400).json({ error: 'École requise' });

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!school) return res.status(404).json({ error: 'École introuvable' });

  if (!(await canAccessSchoolTransferStats(req, schoolId))) {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  const result = await getTransferStats(schoolId);
  return res.json(result);
}

async function complete(req, res) {
  const result = await completeTransfer({
    id: req.params.id,
    classId: req.body.classId || null,
  });
  if (!result.ok) return failRedirect(res, '/transfer/dashboard', result.error);
  await logAudit({
    action: 'transfer_complete',
    entity: 'TransferRequest',
    entityId: req.params.id,
    user: req.user,
    ip: req.ip,
  });
  return res.redirect('/transfer/dashboard?success=completed');
}

module.exports = {
  parentPage,
  request,
  schoolPage,
  approve,
  reject,
  adminPage,
  complete,
  stats,
};
