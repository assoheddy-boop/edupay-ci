const prisma = require('../config/database');
const { logAudit } = require('../utils/audit');
const { loadOrganization, schoolInOrg } = require('../utils/group');
const { sendExcel } = require('../services/exportExcel');
const {
  reEnrollStudent,
  getReinscriptionStats,
  listReinscriptionRows,
  getRedoublementCauseStats,
  getGroupRedoublementCauses,
} = require('../../services/ReinscriptionService');
const {
  generateReinscriptionPDF,
  generateReinscriptionExcel,
  generateRedoublementCausesPDF,
  generateRedoublementCausesExcel,
  generateGroupRedoublementCausesPDF,
  generateGroupRedoublementCausesExcel,
} = require('../../services/export');

const ERRORS = {
  student: 'Élève introuvable.',
  class: 'Classe de destination invalide.',
  repeat_class: 'Un redoublant doit rester dans sa classe actuelle.',
  already_enrolled: 'Cet élève est déjà réinscrit pour cette année.',
  data: 'Données invalides.',
  forbidden: 'Vous n\'êtes pas autorisé.',
  school: 'École introuvable.',
  server: 'Erreur serveur.',
};

async function canAccessSchool(req, schoolId) {
  if (req.user.role === 'SUPER_ADMIN') return true;
  if (req.user.role === 'SCHOOL_ADMIN') return req.user.school?.id === schoolId;
  if (req.user.role === 'ORGANIZATION_ADMIN') {
    const organization = await loadOrganization(req);
    return Boolean(organization && schoolInOrg(organization, schoolId));
  }
  return false;
}

function resolveSchoolId(req) {
  if (req.user?.school?.id) return req.user.school.id;
  return req.query.schoolId || req.body?.schoolId || null;
}

function failRedirect(res, base, error) {
  const code = error && ERRORS[error] ? error : 'data';
  return res.redirect(`${base}?error=${code}`);
}

async function schoolPage(req, res) {
  const schoolId = resolveSchoolId(req);
  if (!schoolId) {
    return res.status(403).render('error', { message: 'École requise', user: req.user });
  }
  if (!(await canAccessSchool(req, schoolId))) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) {
    return res.status(404).render('error', { message: 'École introuvable', user: req.user });
  }

  const schoolYear = req.query.schoolYear || school.currentSchoolYear;
  const [list, stats, causeStats] = await Promise.all([
    listReinscriptionRows(schoolId, schoolYear),
    getReinscriptionStats(schoolId, schoolYear),
    getRedoublementCauseStats(schoolId, schoolYear),
  ]);

  res.render('school/reinscriptionDashboard', {
    user: req.user,
    school,
    schoolId,
    schoolYear,
    rows: list.rows || [],
    classes: list.classes || [],
    stats,
    causeStats,
    error: req.query.error || null,
    success: req.query.success || null,
    errors: ERRORS,
  });
}

async function reEnroll(req, res) {
  const { studentId } = req.params;
  const { nextClassId, schoolYear } = req.body;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, schoolId: true },
  });
  if (!student?.schoolId) {
    if (req.accepts('json') && !req.accepts('html')) {
      return res.status(404).json({ ok: false, error: 'student' });
    }
    return failRedirect(res, '/reinscription/dashboard', 'student');
  }

  if (!(await canAccessSchool(req, student.schoolId))) {
    if (req.accepts('json') && !req.accepts('html')) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    return failRedirect(res, '/reinscription/dashboard', 'forbidden');
  }

  const result = await reEnrollStudent(studentId, nextClassId, schoolYear);
  if (!result.ok) {
    if (req.accepts('json') && !req.accepts('html')) {
      return res.status(400).json(result);
    }
    return failRedirect(res, `/reinscription/dashboard?schoolYear=${encodeURIComponent(schoolYear || '')}`, result.error);
  }

  await logAudit({
    action: 'reinscription',
    entity: 'StudentYearRecord',
    entityId: result.record?.id,
    user: req.user,
    schoolId: student.schoolId,
    ip: req.ip,
    details: {
      studentId,
      schoolYear,
      promoted: result.promoted,
      repeated: result.repeated,
    },
  });

  if (req.accepts('json') && !req.accepts('html')) {
    return res.json(result);
  }
  return res.redirect(`/reinscription/dashboard?schoolYear=${encodeURIComponent(schoolYear || '')}&success=1`);
}

async function stats(req, res) {
  const { schoolId } = req.params;
  if (!schoolId) return res.status(400).json({ error: 'École requise' });

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!school) return res.status(404).json({ error: 'École introuvable' });

  if (!(await canAccessSchool(req, schoolId))) {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  const schoolYear = req.query.schoolYear || undefined;
  const result = await getReinscriptionStats(schoolId, schoolYear);
  return res.json(result);
}

async function causes(req, res) {
  const { schoolId, schoolYear } = req.params;
  if (!schoolId || !schoolYear) {
    return res.status(400).json({ ok: false, error: 'Paramètres requis' });
  }

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!school) return res.status(404).json({ ok: false, error: 'École introuvable' });

  if (!(await canAccessSchool(req, schoolId))) {
    return res.status(403).json({ ok: false, error: 'Accès refusé' });
  }

  const result = await getRedoublementCauseStats(schoolId, schoolYear);
  return res.json(result);
}

async function exportCausesPdf(req, res) {
  const { schoolId } = req.params;
  if (!(await canAccessSchool(req, schoolId))) {
    return res.status(403).send('Forbidden');
  }
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  const schoolYear = req.query.schoolYear || school?.currentSchoolYear;
  const result = await generateRedoublementCausesPDF(schoolId, schoolYear);
  if (!result.ok) return res.status(400).send('Export impossible');
  res.download(result.filepath, result.filename);
}

async function exportCausesExcel(req, res) {
  const { schoolId } = req.params;
  if (!(await canAccessSchool(req, schoolId))) {
    return res.status(403).send('Forbidden');
  }
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  const schoolYear = req.query.schoolYear || school?.currentSchoolYear;
  const result = await generateRedoublementCausesExcel(schoolId, schoolYear);
  if (!result.ok) return res.status(400).send('Export impossible');
  await sendExcel(res, result.filename, result.workbook);
}

async function canAccessGroup(req, groupId) {
  if (req.user.role === 'SUPER_ADMIN') return true;
  if (req.user.role === 'ORGANIZATION_ADMIN') {
    const organization = await loadOrganization(req);
    return Boolean(organization?.groupId && organization.groupId === groupId);
  }
  return false;
}

async function groupCauses(req, res) {
  const { groupId, schoolYear } = req.params;
  if (!groupId || !schoolYear) {
    return res.status(400).json({ ok: false, error: 'Paramètres requis' });
  }

  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } });
  if (!group) return res.status(404).json({ ok: false, error: 'Groupe introuvable' });

  if (!(await canAccessGroup(req, groupId))) {
    return res.status(403).json({ ok: false, error: 'Accès refusé' });
  }

  const result = await getGroupRedoublementCauses(groupId, schoolYear);
  return res.json(result);
}

async function groupDashboard(req, res) {
  const { groupId } = req.params;
  if (!groupId) {
    return res.status(400).render('error', { message: 'Groupe requis', user: req.user });
  }

  if (!(await canAccessGroup(req, groupId))) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) {
    return res.status(404).render('error', { message: 'Groupe introuvable', user: req.user });
  }

  const schoolYear = req.query.schoolYear || '2025-2026';
  const stats = await getGroupRedoublementCauses(groupId, schoolYear);
  const selectedSchoolId = req.query.schoolId || stats.schools?.[0]?.schoolId || null;

  res.render('admin/groupDashboard', {
    user: req.user,
    group,
    groupId,
    schoolYear,
    stats,
    selectedSchoolId,
    groups: null,
  });
}

async function adminGroupDashboard(req, res) {
  if (req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  const groups = await prisma.group.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { schools: true } } },
  });

  const groupId = req.params.groupId || req.query.groupId || groups[0]?.id || null;
  const group = groupId
    ? await prisma.group.findUnique({ where: { id: groupId } })
    : null;
  const schoolYear = req.query.schoolYear || '2025-2026';
  const stats = groupId ? await getGroupRedoublementCauses(groupId, schoolYear) : null;
  const selectedSchoolId = req.query.schoolId || stats?.schools?.[0]?.schoolId || null;

  res.render('admin/groupDashboard', {
    user: req.user,
    group,
    groupId,
    schoolYear,
    stats,
    selectedSchoolId,
    groups,
  });
}

async function exportGroupCausesPdf(req, res) {
  const { groupId } = req.params;
  if (!(await canAccessGroup(req, groupId))) {
    return res.status(403).send('Forbidden');
  }
  const schoolYear = req.query.schoolYear || '2025-2026';
  const result = await generateGroupRedoublementCausesPDF(groupId, schoolYear);
  if (!result.ok) return res.status(400).send('Export impossible');
  res.download(result.filepath, result.filename);
}

async function exportGroupCausesExcel(req, res) {
  const { groupId } = req.params;
  if (!(await canAccessGroup(req, groupId))) {
    return res.status(403).send('Forbidden');
  }
  const schoolYear = req.query.schoolYear || '2025-2026';
  const result = await generateGroupRedoublementCausesExcel(groupId, schoolYear);
  if (!result.ok) return res.status(400).send('Export impossible');
  await sendExcel(res, result.filename, result.workbook);
}

async function exportPdf(req, res) {
  const { schoolId } = req.params;
  if (!(await canAccessSchool(req, schoolId))) {
    return res.status(403).send('Forbidden');
  }
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  const schoolYear = req.query.schoolYear || school?.currentSchoolYear;
  const result = await generateReinscriptionPDF(schoolId, schoolYear);
  if (!result.ok) return res.status(400).send('Export impossible');
  res.download(result.filepath, result.filename);
}

async function exportExcel(req, res) {
  const { schoolId } = req.params;
  if (!(await canAccessSchool(req, schoolId))) {
    return res.status(403).send('Forbidden');
  }
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  const schoolYear = req.query.schoolYear || school?.currentSchoolYear;
  const result = await generateReinscriptionExcel(schoolId, schoolYear);
  if (!result.ok) return res.status(400).send('Export impossible');
  await sendExcel(res, result.filename, result.workbook);
}

module.exports = {
  schoolPage,
  reEnroll,
  stats,
  causes,
  groupCauses,
  groupDashboard,
  adminGroupDashboard,
  exportPdf,
  exportExcel,
  exportCausesPdf,
  exportCausesExcel,
  exportGroupCausesPdf,
  exportGroupCausesExcel,
  canAccessSchool,
  canAccessGroup,
};
