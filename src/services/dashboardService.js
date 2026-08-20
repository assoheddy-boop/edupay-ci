const prisma = require('../config/database');
const { getPendingPayments } = require('../../services/PaymentService');
const { listReinscriptionRows } = require('../../services/ReinscriptionService');
const { listTodayTill, todayRange } = require('./caisseService');
const { resolveRiskTerm, getRiskSummary } = require('./riskService');
const {
  getSchoolGenderStats,
  getAbsenceStatsByGender,
  getSuccessRateByGender,
} = require('../../services/StatsService');
const { getReinscriptionStats } = require('../../services/ReinscriptionService');
const { formatTermLabel } = require('./academicTerms');

function gradeTermFilter(term) {
  return {
    OR: [{ term }, { period: term }],
  };
}

async function countBulletinsToGenerate(schoolId, term) {
  if (!schoolId || !term) return 0;
  const students = await prisma.student.findMany({
    where: { schoolId, grades: { some: gradeTermFilter(term) } },
    select: {
      id: true,
      bulletins: { where: { period: term }, select: { id: true }, take: 1 },
    },
  });
  return students.filter((s) => !s.bulletins.length).length;
}

async function countDeliberationsPending(schoolId, schoolYear, term) {
  if (!schoolId || !term) return 0;
  const [withGrades, saved] = await Promise.all([
    prisma.student.count({
      where: { schoolId, grades: { some: gradeTermFilter(term) } },
    }),
    prisma.deliberation.count({
      where: { schoolId, schoolYear, term },
    }),
  ]);
  return Math.max(0, withGrades - saved);
}

async function countAbsencesToday(schoolId) {
  const { start, end } = todayRange();
  const [absences, lates] = await Promise.all([
    prisma.absence.count({
      where: {
        student: { schoolId },
        type: 'ABSENCE',
        date: { gte: start, lte: end },
      },
    }),
    prisma.absence.count({
      where: {
        student: { schoolId },
        type: 'LATE',
        date: { gte: start, lte: end },
      },
    }),
  ]);
  return { absences, lates };
}

async function loadDirectorWidgets(schoolId, schoolYear) {
  const term = resolveRiskTerm({ schoolYear });
  const [
    pendingList,
    deliberationsPending,
    riskWidget,
    gender,
    absenceByGender,
    successByGender,
    reinscription,
  ] = await Promise.all([
    getPendingPayments(schoolId),
    countDeliberationsPending(schoolId, schoolYear, term),
    getRiskSummary({ schoolId, schoolYear }).catch(() => ({
      ok: true,
      rows: [],
      counts: { ELEVE: 0, MOYEN: 0, FAIBLE: 0 },
      term: 'T1',
    })),
    getSchoolGenderStats(schoolId),
    getAbsenceStatsByGender({ schoolId }),
    getSuccessRateByGender({ schoolId }),
    getReinscriptionStats(schoolId, schoolYear),
  ]);

  const unpaidTotal = pendingList.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  return {
    term,
    termLabel: formatTermLabel(term),
    deliberationsPending,
    pendingPayments: pendingList.length,
    unpaidTotal,
    riskWidget,
    analyse: { gender, absenceByGender, successByGender, reinscription, schoolYear },
  };
}

async function loadSecretariatWidgets(schoolId, schoolYear) {
  const term = resolveRiskTerm({ schoolYear });
  const [
    reinscriptionRows,
    bulletinsToGenerate,
    convocationsUpcoming,
    caisseToday,
    pendingDocuments,
  ] = await Promise.all([
    listReinscriptionRows(schoolId, schoolYear),
    countBulletinsToGenerate(schoolId, term),
    prisma.examSession.count({
      where: { schoolId, date: { gte: todayRange().start } },
    }),
    listTodayTill(schoolId),
    prisma.absenceJustification.count({
      where: { schoolId, status: 'PENDING' },
    }),
  ]);

  const pendingEnrollments = (reinscriptionRows.rows || []).filter((r) => !r.enrolled).length;

  return {
    term,
    termLabel: formatTermLabel(term),
    pendingEnrollments,
    bulletinsToGenerate,
    convocationsUpcoming,
    caisseToday: caisseToday.totals,
    caissePayments: caisseToday.payments.slice(0, 5),
    pendingDocuments,
  };
}

async function loadAccountantWidgets(schoolId) {
  const { start, end } = todayRange();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [
    pendingList,
    paymentsToday,
    accountingEntries,
    payrollRun,
  ] = await Promise.all([
    getPendingPayments(schoolId),
    prisma.payment.aggregate({
      where: {
        status: 'VALIDATED',
        student: { schoolId },
        OR: [
          { validatedAt: { gte: start, lte: end } },
          { createdAt: { gte: start, lte: end } },
        ],
      },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.financeTransaction.count({
      where: { schoolId, createdAt: { gte: monthStart } },
    }),
    prisma.payrollRun.findFirst({
      where: { schoolId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    }),
  ]);

  const unpaidTotal = pendingList.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  return {
    pendingPayments: pendingList.length,
    unpaidTotal,
    paymentsTodayCount: paymentsToday._count || 0,
    paymentsTodayTotal: paymentsToday._sum.amount || 0,
    accountingEntriesMonth: accountingEntries,
    payrollRun,
  };
}

async function loadEducatorWidgets(schoolId, schoolYear) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [todayCounts, activeSocialCases, disciplineIncidents, riskWidget] = await Promise.all([
    countAbsencesToday(schoolId),
    prisma.socialCase.count({ where: { schoolId, status: 'actif' } }),
    prisma.behaviorNote.count({
      where: {
        student: { schoolId },
        type: 'NEGATIVE',
        createdAt: { gte: weekAgo },
      },
    }),
    getRiskSummary({ schoolId, schoolYear }).catch(() => ({
      ok: true,
      rows: [],
      counts: { ELEVE: 0, MOYEN: 0, FAIBLE: 0 },
      term: 'T1',
    })),
  ]);

  return {
    absencesToday: todayCounts.absences,
    latesToday: todayCounts.lates,
    activeSocialCases,
    disciplineIncidents,
    riskWidget,
  };
}

async function loadLifeSchoolWidgets(schoolId) {
  const { start, end } = todayRange();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    todayCounts,
    disciplineIncidents,
    canteenMenu,
    activitiesCount,
    lostItemsOpen,
  ] = await Promise.all([
    countAbsencesToday(schoolId),
    prisma.behaviorNote.count({
      where: {
        student: { schoolId },
        type: 'NEGATIVE',
        createdAt: { gte: weekAgo },
      },
    }),
    prisma.canteenMenu.findFirst({
      where: { schoolId, date: { gte: start, lte: end } },
    }),
    prisma.extracurricular.count({ where: { schoolId } }),
    prisma.lostItem.count({ where: { schoolId, claimed: false } }),
  ]);

  return {
    latesToday: todayCounts.lates,
    absencesToday: todayCounts.absences,
    disciplineIncidents,
    canteenMenu,
    activitiesCount,
    lostItemsOpen,
  };
}

async function loadRoleDashboard(staffRole, school, schoolYear) {
  const schoolId = school.id;
  switch (staffRole) {
    case 'SECRETARIAT':
      return { role: staffRole, widgets: await loadSecretariatWidgets(schoolId, schoolYear) };
    case 'ACCOUNTANT':
      return { role: staffRole, widgets: await loadAccountantWidgets(schoolId) };
    case 'EDUCATOR':
      return { role: staffRole, widgets: await loadEducatorWidgets(schoolId, schoolYear) };
    case 'LIFE_SCHOOL':
      return { role: staffRole, widgets: await loadLifeSchoolWidgets(schoolId) };
    case 'DIRECTOR':
    default:
      return { role: 'DIRECTOR', widgets: await loadDirectorWidgets(schoolId, schoolYear) };
  }
}

module.exports = {
  loadRoleDashboard,
  loadDirectorWidgets,
  loadSecretariatWidgets,
  loadAccountantWidgets,
  loadEducatorWidgets,
  loadLifeSchoolWidgets,
  countBulletinsToGenerate,
  countDeliberationsPending,
  countAbsencesToday,
};
