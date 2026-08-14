const prisma = require('../config/database');
const { getAbsenceStats, getSuccessRate, getHealthStats, getAbsenceStatsByGender, getSuccessRateByGender } = require('../../services/StatsService');
const { getGenderStatsBySchool } = require('../../services/ClassService');
const { generateGenderStatsExcel, generateGenderStatsPDF, generateRedoublementByPlanPDF, generateRedoublementByPlanExcel } = require('../../services/export');
const { getRedoublementCausesByPlan } = require('../../services/RedoublementService');
const { sendExcel } = require('../services/exportExcel');
const { listAuditTrail } = require('../utils/audit');

const ACTION_LABELS = {
  login: 'Connexion',
  school_modules_update: 'Modules école',
  school_modules_enable_all: 'Activation de tous les modules',
  school_modules_matrix: 'Matrice des modules',
  plan_modules_update: 'Modules du plan',
  school_plan_activate: 'Activation de plan',
  scholarship_create: 'Création de bourse',
  scholarship_status: 'Statut de bourse',
  accounting_entry: 'Écriture comptable',
  transfer_request: 'Demande de transfert',
  transfer_approve: 'Approbation de transfert',
  transfer_reject: 'Rejet de transfert',
  transfer_complete: 'Finalisation de transfert',
  payroll_generate: 'Génération de paie',
  payroll_pay: 'Paiement de paie',
};

function filtersFromQuery(query = {}) {
  return {
    schoolId: query.schoolId || null,
    classId: query.classId || null,
    subject: query.subject || null,
    period: query.period || null,
    from: query.from || '',
    to: query.to || '',
  };
}

async function reportingPage(req, res) {
  const filters = filtersFromQuery(req.query);
  const schoolYear = req.query.schoolYear || '2025-2026';
  const statsFilter = {
    schoolId: filters.schoolId || undefined,
    classId: filters.classId || undefined,
    subject: filters.subject || undefined,
    period: filters.period || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  };

  const genderScope = {
    schoolId: filters.schoolId || undefined,
    classId: filters.classId || undefined,
  };

  const [schools, classes, absences, success, health, gender, absenceByGender, successByGender, redoublementByPlan] = await Promise.all([
    prisma.school.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, city: true } }),
    prisma.class.findMany({
      where: filters.schoolId ? { schoolId: filters.schoolId } : {},
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, level: true, schoolId: true, school: { select: { name: true } } },
    }),
    getAbsenceStats(statsFilter),
    getSuccessRate(statsFilter),
    getHealthStats(statsFilter),
    getGenderStatsBySchool(filters.schoolId || undefined),
    getAbsenceStatsByGender(genderScope),
    getSuccessRateByGender(genderScope),
    getRedoublementCausesByPlan(schoolYear),
  ]);

  res.render('admin/reportingDashboard', {
    user: req.user,
    schools,
    classes,
    filters,
    absences,
    success,
    health,
    genderBySchool: gender.schools || [],
    absenceByGender,
    successByGender,
    schoolYear,
    redoublementByPlan: redoublementByPlan.ok ? redoublementByPlan : { plans: [], schoolYear },
  });
}

async function auditPage(req, res) {
  const userId = req.query.userId || '';
  const action = req.query.action || '';
  const from = req.query.from || '';
  const to = req.query.to || '';

  const [entries, users, actionRows] = await Promise.all([
    listAuditTrail({
      userId: userId || undefined,
      action: action || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    prisma.user.findMany({
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 500,
    }),
    prisma.auditTrail.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    }),
  ]);

  res.render('admin/audit', {
    user: req.user,
    entries,
    users,
    actions: actionRows.map((row) => row.action),
    filters: { userId, action, from, to },
    labels: ACTION_LABELS,
  });
}

async function exportGenderExcel(req, res) {
  const schoolId = req.query.schoolId;
  if (!schoolId) return res.redirect('/admin/reporting');
  const result = await generateGenderStatsExcel(schoolId);
  if (!result.ok) return res.redirect('/admin/reporting');
  await sendExcel(res, result.filename, result.workbook);
}

async function exportGenderPdf(req, res) {
  const schoolId = req.query.schoolId;
  if (!schoolId) return res.redirect('/admin/reporting');
  const result = await generateGenderStatsPDF(schoolId);
  if (!result.ok) return res.redirect('/admin/reporting');
  res.download(result.filepath, result.filename);
}

async function exportRedoublementPlanExcel(req, res) {
  const schoolYear = req.query.schoolYear || '2025-2026';
  const result = await generateRedoublementByPlanExcel(schoolYear);
  if (!result.ok) return res.redirect(`/admin/reporting?schoolYear=${encodeURIComponent(schoolYear)}`);
  await sendExcel(res, result.filename, result.workbook);
}

async function exportRedoublementPlanPdf(req, res) {
  const schoolYear = req.query.schoolYear || '2025-2026';
  const result = await generateRedoublementByPlanPDF(schoolYear);
  if (!result.ok) return res.redirect(`/admin/reporting?schoolYear=${encodeURIComponent(schoolYear)}`);
  res.download(result.filepath, result.filename);
}

module.exports = {
  reportingPage,
  auditPage,
  exportGenderExcel,
  exportGenderPdf,
  exportRedoublementPlanExcel,
  exportRedoublementPlanPdf,
  ACTION_LABELS,
};
