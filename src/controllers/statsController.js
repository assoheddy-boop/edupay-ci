const prisma = require('../config/database');
const { buildWorkbook, sendExcel } = require('../services/exportExcel');
const { computeAverage, loadSchoolCoefficients } = require('../services/gradesAverage');
const { logAudit } = require('../utils/audit');
const { generateStatsExcel } = require('../../services/export');
const { getCache, setCache } = require('../../services/cache');

const STATS_TTL = 5 * 60;

async function loadSchoolStats(schoolId) {
  const cacheKey = `stats:school:${schoolId}`;
  const cached = await getCache(cacheKey);
  if (cached?.stats && cached?.byClass) return cached;

  const [students, payments, absences, grades, classes, coeffMap] = await Promise.all([
    prisma.student.count({ where: { schoolId } }),
    prisma.payment.groupBy({
      by: ['status'],
      where: { student: { schoolId } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.absence.count({ where: { student: { schoolId } } }),
    prisma.grade.findMany({ where: { student: { schoolId } } }),
    prisma.class.findMany({
      where: { schoolId },
      include: { _count: { select: { students: true } } },
    }),
    loadSchoolCoefficients(schoolId),
  ]);

  const validated = payments.find((p) => p.status === 'VALIDATED');
  const pending = payments.find((p) => p.status === 'PENDING');
  const avgGrade = grades.length ? computeAverage(grades, coeffMap) : 0;

  const byClass = await Promise.all(
    classes.map(async (c) => {
      const classGrades = await prisma.grade.findMany({
        where: { student: { classId: c.id } },
      });
      const classPayments = await prisma.payment.count({
        where: { status: 'VALIDATED', student: { classId: c.id } },
      });
      return {
        name: c.name,
        students: c._count.students,
        avg: classGrades.length ? computeAverage(classGrades, coeffMap) : 0,
        paymentsValidated: classPayments,
      };
    }),
  );

  const payload = {
    stats: {
      students,
      validatedAmount: validated?._sum.amount || 0,
      validatedCount: validated?._count || 0,
      pendingAmount: pending?._sum.amount || 0,
      pendingCount: pending?._count || 0,
      absences,
      avgGrade,
    },
    byClass,
  };
  await setCache(cacheKey, payload, STATS_TTL);
  return payload;
}

async function statsPage(req, res) {
  const schoolId = req.user.school.id;
  const { stats, byClass } = await loadSchoolStats(schoolId);

  const auditLogs = await prisma.auditLog.findMany({
    where: { schoolId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  res.render('school/stats', {
    user: req.user,
    school: req.user.school,
    stats,
    byClass,
    auditLogs,
  });
}

async function exportStudents(req, res) {
  const students = await prisma.student.findMany({
    where: { schoolId: req.user.school.id },
    include: { class: true },
    orderBy: { lastName: 'asc' },
  });

  const wb = await buildWorkbook(
    'Élèves',
    [
      { header: 'Prénom', key: 'firstName', width: 15 },
      { header: 'Nom', key: 'lastName', width: 15 },
      { header: 'Classe', key: 'class', width: 12 },
      { header: 'Matricule', key: 'matricule', width: 15 },
    ],
    students.map((s) => ({
      firstName: s.firstName,
      lastName: s.lastName,
      class: s.class.name,
      matricule: s.matricule || '',
    })),
  );

  await sendExcel(res, 'eleves-educonnect.xlsx', wb);
}

async function exportPayments(req, res) {
  const payments = await prisma.payment.findMany({
    where: { student: { schoolId: req.user.school.id } },
    include: { student: true, feeType: true },
    orderBy: { createdAt: 'desc' },
  });

  const wb = await buildWorkbook(
    'Paiements',
    [
      { header: 'Élève', key: 'student', width: 20 },
      { header: 'Montant', key: 'amount', width: 12 },
      { header: 'Statut', key: 'status', width: 12 },
      { header: 'Type', key: 'fee', width: 15 },
      { header: 'Date', key: 'date', width: 15 },
    ],
    payments.map((p) => ({
      student: `${p.student.firstName} ${p.student.lastName}`,
      amount: p.amount,
      status: p.status,
      fee: p.feeType?.name || '—',
      date: new Date(p.createdAt).toLocaleDateString('fr-FR'),
    })),
  );

  await sendExcel(res, 'paiements-educonnect.xlsx', wb);
}

async function exportGrades(req, res) {
  const grades = await prisma.grade.findMany({
    where: { student: { schoolId: req.user.school.id } },
    include: { student: { include: { class: true } } },
    orderBy: [{ period: 'asc' }, { subject: 'asc' }],
  });

  const wb = await buildWorkbook(
    'Notes',
    [
      { header: 'Élève', key: 'student', width: 20 },
      { header: 'Classe', key: 'class', width: 12 },
      { header: 'Matière', key: 'subject', width: 15 },
      { header: 'Note', key: 'value', width: 8 },
      { header: 'Période', key: 'period', width: 12 },
    ],
    grades.map((g) => ({
      student: `${g.student.firstName} ${g.student.lastName}`,
      class: g.student.class.name,
      subject: g.subject,
      value: `${g.value}/${g.maxValue}`,
      period: g.period,
    })),
  );

  await sendExcel(res, 'notes-educonnect.xlsx', wb);
}

async function exportStats(req, res) {
  const result = await generateStatsExcel(req.user.school.id);
  if (!result.ok) return res.redirect('/school/stats');
  await sendExcel(res, result.filename, result.workbook);
}

async function feesPage(req, res) {
  const fees = await prisma.feeType.findMany({
    where: { schoolId: req.user.school.id },
    orderBy: { name: 'asc' },
  });
  res.render('school/fees', {
    user: req.user,
    school: req.user.school,
    fees,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function createFee(req, res) {
  const { name, amount, description, dueDay } = req.body;
  await prisma.feeType.create({
    data: {
      schoolId: req.user.school.id,
      name,
      amount: parseInt(amount, 10),
      description,
      dueDay: dueDay ? parseInt(dueDay, 10) : null,
    },
  });
  await logAudit({ action: 'fee_create', entity: 'FeeType', user: req.user, ip: req.ip, details: { name } });
  res.redirect('/school/fees?success=1');
}

async function updateFee(req, res) {
  const { id } = req.params;
  const { name, amount, description, dueDay, isActive } = req.body;
  await prisma.feeType.updateMany({
    where: { id, schoolId: req.user.school.id },
    data: {
      name,
      amount: parseInt(amount, 10),
      description,
      dueDay: dueDay ? parseInt(dueDay, 10) : null,
      isActive: isActive === 'on' || isActive === 'true',
    },
  });
  await logAudit({ action: 'fee_update', entity: 'FeeType', entityId: id, user: req.user, ip: req.ip });
  res.redirect('/school/fees?success=updated');
}

async function deleteFee(req, res) {
  const { id } = req.params;
  await prisma.feeType.deleteMany({ where: { id, schoolId: req.user.school.id } });
  await logAudit({ action: 'fee_delete', entity: 'FeeType', entityId: id, user: req.user, ip: req.ip });
  res.redirect('/school/fees?success=deleted');
}

module.exports = {
  statsPage,
  exportStudents,
  exportPayments,
  exportGrades,
  exportStats,
  feesPage,
  createFee,
  updateFee,
  deleteFee,
};
