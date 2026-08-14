const prisma = require('../config/database');
const { initFinanceDefaults } = require('../utils/modules');

async function dashboard(req, res) {
  const schoolId = req.user.school.id;
  await initFinanceDefaults(schoolId);

  const [accounts, transactions, paymentsValidated] = await Promise.all([
    prisma.financeAccount.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
    prisma.financeTransaction.findMany({
      where: { schoolId },
      include: { account: true, category: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.payment.aggregate({
      where: { status: 'VALIDATED', student: { class: { schoolId } } },
      _sum: { amount: true },
    }),
  ]);

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthIncome = await prisma.financeTransaction.aggregate({
    where: { schoolId, type: 'INCOME', createdAt: { gte: monthStart } },
    _sum: { amount: true },
  });
  const monthExpense = await prisma.financeTransaction.aggregate({
    where: { schoolId, type: 'EXPENSE', createdAt: { gte: monthStart } },
    _sum: { amount: true },
  });

  const categories = await prisma.expenseCategory.findMany({ where: { schoolId } });

  res.render('school/accounting/dashboard', {
    user: req.user,
    school: req.user.school,
    accounts,
    transactions,
    categories,
    stats: {
      totalBalance,
      monthIncome: monthIncome._sum.amount || 0,
      monthExpense: monthExpense._sum.amount || 0,
      paymentsTotal: paymentsValidated._sum.amount || 0,
    },
    success: req.query.success || null,
  });
}

async function addTransaction(req, res) {
  const schoolId = req.user.school.id;
  const { type, amount, accountId, categoryId, description, reference } = req.body;
  const amt = parseInt(amount, 10);

  await prisma.$transaction(async (tx) => {
    await tx.financeTransaction.create({
      data: {
        schoolId,
        type,
        amount: amt,
        accountId,
        categoryId: categoryId || null,
        description,
        reference,
      },
    });
    const delta = type === 'INCOME' ? amt : -amt;
    await tx.financeAccount.update({
      where: { id: accountId },
      data: { balance: { increment: delta } },
    });
  });

  try {
    const { addEntry } = require('../../services/AccountingService');
    await addEntry({
      schoolId,
      type,
      amount: amt,
      description: description || reference || 'Écriture école',
      date: new Date(),
    });
  } catch (err) {
    console.error('AccountingEntry dual-write failed', err.message);
  }

  res.redirect('/school/accounting?success=1');
}

async function report(req, res) {
  const schoolId = req.user.school.id;
  const { month } = req.query;
  const [y, m] = (month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`).split('-');
  const start = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  const end = new Date(parseInt(y, 10), parseInt(m, 10), 0, 23, 59, 59);

  const [income, expense, byCategory, accounts] = await Promise.all([
    prisma.financeTransaction.findMany({
      where: { schoolId, type: 'INCOME', createdAt: { gte: start, lte: end } },
      include: { account: true },
    }),
    prisma.financeTransaction.findMany({
      where: { schoolId, type: 'EXPENSE', createdAt: { gte: start, lte: end } },
      include: { account: true, category: true },
    }),
    prisma.financeTransaction.groupBy({
      by: ['categoryId'],
      where: { schoolId, type: 'EXPENSE', createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
    prisma.financeAccount.findMany({ where: { schoolId } }),
  ]);

  const totalIn = income.reduce((s, t) => s + t.amount, 0);
  const totalOut = expense.reduce((s, t) => s + t.amount, 0);

  res.render('school/accounting/report', {
    user: req.user,
    school: req.user.school,
    period: `${m}/${y}`,
    month: month || `${y}-${m}`,
    income,
    expense,
    byCategory,
    accounts,
    totals: { totalIn, totalOut, net: totalIn - totalOut },
  });
}

module.exports = { dashboard, addTransaction, report };
