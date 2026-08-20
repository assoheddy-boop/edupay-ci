const prisma = require('../config/database');
const { initFinanceDefaults } = require('../utils/modules');
const { generatePayroll: generateTeacherPayroll } = require('../../services/HRService');
const { buildOfficialPayslip } = require('./paySlipService');

function parseMonth(month) {
  if (typeof month === 'string' && month.includes('-')) {
    const [yearPart, monthPart] = month.split('-');
    return { month: parseInt(monthPart, 10), year: parseInt(yearPart, 10) };
  }
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

async function getPendingAdvances(profile) {
  const where = profile.teacherId
    ? { teacherId: profile.teacherId, status: 'APPROVED' }
    : { staffProfileId: profile.id, status: 'APPROVED' };
  const advances = await prisma.salaryAdvance.findMany({ where });
  return advances.reduce((s, a) => s + a.amount, 0);
}

async function generateStaffPayroll(staffProfileId, month) {
  const { month: m, year: y } = parseMonth(month);
  const profile = await prisma.staffProfile.findUnique({
    where: { id: staffProfileId },
    include: { teacher: { include: { user: true, school: true } } },
  });
  if (!profile) return { ok: false, error: 'profile' };

  const schoolId = profile.schoolId;
  let payrollRun = await prisma.payrollRun.findUnique({
    where: { schoolId_month_year: { schoolId, month: m, year: y } },
  });
  if (payrollRun?.status === 'PAID') return { ok: false, error: 'already_paid' };
  if (!payrollRun) {
    payrollRun = await prisma.payrollRun.create({
      data: { schoolId, month: m, year: y, status: 'DRAFT' },
    });
  }

  const advanceTotal = await getPendingAdvances(profile);

  if (profile.teacherId) {
    return generateTeacherPayroll(profile.teacherId, `${y}-${String(m).padStart(2, '0')}`);
  }

  const school = await prisma.school.findUnique({ where: { id: schoolId } });

  const payslip = await prisma.payslip.upsert({
    where: { payrollRunId_staffProfileId: { payrollRunId: payrollRun.id, staffProfileId: profile.id } },
    create: {
      payrollRunId: payrollRun.id,
      schoolId,
      staffProfileId: profile.id,
      teacherId: null,
      baseSalary: profile.baseSalary || 0,
      advances: advanceTotal,
      netPay: 0,
    },
    update: {
      baseSalary: profile.baseSalary || 0,
      advances: advanceTotal,
    },
  });

  const official = await buildOfficialPayslip({
    payslipId: payslip.id,
    school,
    profile,
    teacher: null,
    payrollRun,
    advances: advanceTotal,
  });

  const totals = await prisma.payslip.aggregate({
    where: { payrollRunId: payrollRun.id },
    _sum: { netPay: true },
  });
  await prisma.payrollRun.update({
    where: { id: payrollRun.id },
    data: { totalNet: totals._sum.netPay || 0, status: 'VALIDATED' },
  });

  return {
    ok: true,
    payslip: official.payslip,
    netPay: official.netPay,
    payrollRunId: payrollRun.id,
    pdfUrl: official.pdfUrl,
  };
}

async function generatePayroll({ schoolId, month, year, teacherIds }) {
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  const period = `${y}-${String(m).padStart(2, '0')}`;

  const existing = await prisma.payrollRun.findUnique({
    where: { schoolId_month_year: { schoolId, month: m, year: y } },
  });
  if (existing?.status === 'PAID') return { error: 'already_paid' };

  const profiles = await prisma.staffProfile.findMany({
    where: {
      schoolId,
      status: 'ACTIVE',
      ...(teacherIds?.length ? { teacherId: { in: teacherIds } } : {}),
    },
  });

  const results = [];
  for (const profile of profiles) {
    if ((profile.baseSalary || 0) <= 0 && profile.contractType !== 'VACATAIRE') continue;
    const result = await generateStaffPayroll(profile.id, period);
    if (!result.ok) {
      if (result.error === 'already_paid') return { error: 'already_paid' };
      continue;
    }
    results.push({ staffProfileId: profile.id, netPay: result.netPay });
  }

  const payrollRun = await prisma.payrollRun.findUnique({
    where: { schoolId_month_year: { schoolId, month: m, year: y } },
  });

  return {
    payrollRunId: payrollRun?.id,
    totalNet: payrollRun?.totalNet || 0,
    count: results.length,
    results,
  };
}

async function markPayrollPaid({ schoolId, payrollRunId, accountId }) {
  const payrollRun = await prisma.payrollRun.findFirst({
    where: { id: payrollRunId, schoolId },
    include: {
      payslips: {
        include: {
          teacher: { include: { user: true } },
          staffProfile: true,
        },
      },
    },
  });
  if (!payrollRun || payrollRun.status === 'PAID') return { error: 'invalid' };

  await initFinanceDefaults(schoolId);
  const salaires = await prisma.expenseCategory.findFirst({
    where: { schoolId, name: 'Salaires' },
  });
  const account = await prisma.financeAccount.findFirst({
    where: { id: accountId, schoolId },
  });
  if (!account) return { error: 'account' };

  await prisma.$transaction(async (tx) => {
    for (const payslip of payrollRun.payslips) {
      const advanceWhere = payslip.teacherId
        ? { teacherId: payslip.teacherId, status: 'APPROVED' }
        : { staffProfileId: payslip.staffProfileId, status: 'APPROVED' };
      const advances = await tx.salaryAdvance.findMany({ where: advanceWhere });
      for (const adv of advances) {
        await tx.salaryAdvance.update({
          where: { id: adv.id },
          data: { status: 'DEDUCTED', deductedAt: new Date() },
        });
      }
    }

    if (payrollRun.totalNet > 0) {
      const { recordMovement } = require('../../services/AccountingService');
      const movement = await recordMovement({
        schoolId,
        type: 'EXPENSE',
        amount: payrollRun.totalNet,
        accountId: account.id,
        categoryId: salaires?.id || null,
        description: `Paie ${payrollRun.month}/${payrollRun.year} — ${payrollRun.payslips.length} bulletin(s)`,
        reference: payrollRun.id,
        payrollRunId: payrollRun.id,
        source: 'PAYROLL',
      }, tx);
      if (!movement.ok) throw new Error(movement.error || 'accounting');
    }

    await tx.payrollRun.update({
      where: { id: payrollRun.id },
      data: { status: 'PAID', paidAt: new Date() },
    });
  });

  return { success: true, totalNet: payrollRun.totalNet };
}

module.exports = {
  generatePayroll,
  generateStaffPayroll,
  markPayrollPaid,
  getPendingAdvances,
};
