const prisma = require('../config/database');
const { initFinanceDefaults } = require('../utils/modules');
const { generatePayroll: generateTeacherPayroll } = require('../../services/HRService');

async function getPendingAdvances(teacherId) {
  const advances = await prisma.salaryAdvance.findMany({
    where: { teacherId, status: 'APPROVED' },
  });
  return advances.reduce((s, a) => s + a.amount, 0);
}

async function generatePayroll({ schoolId, month, year, teacherIds }) {
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  const period = `${y}-${String(m).padStart(2, '0')}`;

  const existing = await prisma.payrollRun.findUnique({
    where: { schoolId_month_year: { schoolId, month: m, year: y } },
  });

  if (existing?.status === 'PAID') {
    return { error: 'already_paid' };
  }

  const teachers = await prisma.teacher.findMany({
    where: {
      schoolId,
      ...(teacherIds?.length ? { id: { in: teacherIds } } : {}),
      staffProfile: { status: 'ACTIVE' },
    },
  });

  const results = [];
  for (const teacher of teachers) {
    const result = await generateTeacherPayroll(teacher.id, period);
    if (!result.ok) {
      if (result.error === 'already_paid') return { error: 'already_paid' };
      continue;
    }
    results.push({ teacherId: teacher.id, netPay: result.netPay });
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
    include: { payslips: { include: { teacher: { include: { user: true } } } } },
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
      const advances = await tx.salaryAdvance.findMany({
        where: { teacherId: payslip.teacherId, status: 'APPROVED' },
      });
      for (const adv of advances) {
        await tx.salaryAdvance.update({
          where: { id: adv.id },
          data: { status: 'DEDUCTED', deductedAt: new Date() },
        });
      }
    }

    await tx.financeTransaction.create({
      data: {
        schoolId,
        type: 'EXPENSE',
        amount: payrollRun.totalNet,
        accountId: account.id,
        categoryId: salaires?.id || null,
        description: `Paie ${payrollRun.month}/${payrollRun.year} — ${payrollRun.payslips.length} bulletin(s)`,
        reference: payrollRun.id,
        payrollRunId: payrollRun.id,
      },
    });

    await tx.financeAccount.update({
      where: { id: account.id },
      data: { balance: { decrement: payrollRun.totalNet } },
    });

    await tx.payrollRun.update({
      where: { id: payrollRun.id },
      data: { status: 'PAID', paidAt: new Date() },
    });
  });

  return { success: true, totalNet: payrollRun.totalNet };
}

module.exports = { generatePayroll, markPayrollPaid, getPendingAdvances };
