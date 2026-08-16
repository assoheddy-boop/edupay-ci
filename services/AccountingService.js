const prisma = require('../src/config/database');
const logger = require('./logger');

const ENTRY_TYPES = ['INCOME', 'EXPENSE'];
const SCHOLARSHIP_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'PAID'];
const ACCOUNT_TYPES = ['WAVE', 'ORANGE_MONEY', 'CASH', 'BANK'];
const CATEGORY_KINDS = ['INCOME', 'EXPENSE'];
const SOURCES = ['MANUAL', 'PAYMENT', 'PAYROLL'];

const ACCOUNT_TYPE_LABELS = {
  WAVE: 'Wave',
  ORANGE_MONEY: 'Orange Money',
  CASH: 'Caisse (espèces)',
  BANK: 'Banque',
};

const INCOME_CATEGORY_SCOLARITE = 'Scolarité';
const INCOME_CATEGORY_CANTINE = 'Cantine';
const INCOME_CATEGORY_EXTRAS = 'Extras';

function parseAmount(amount) {
  const value = parseInt(amount, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseDate(value) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dateRange(from, to) {
  const start = from ? new Date(from) : null;
  const end = to ? new Date(to) : null;
  if (end && !Number.isNaN(end.getTime())) end.setHours(23, 59, 59, 999);
  const where = {};
  if (start && !Number.isNaN(start.getTime())) where.gte = start;
  if (end && !Number.isNaN(end.getTime())) where.lte = end;
  return Object.keys(where).length ? where : undefined;
}

function schoolYearRange(schoolYear) {
  const match = String(schoolYear || '').trim().match(/^(\d{4})\s*[-/]\s*(\d{4})$/);
  if (!match) return null;
  const startY = parseInt(match[1], 10);
  const endY = parseInt(match[2], 10);
  if (!startY || !endY || endY < startY) return null;
  return {
    start: new Date(startY, 8, 1),
    end: new Date(endY, 7, 31, 23, 59, 59, 999),
  };
}

function parsePeriod({ month, schoolYear, view } = {}) {
  const wantYear = view === 'year' || (view !== 'month' && !month && !!schoolYear);
  if (wantYear) {
    const range = schoolYearRange(schoolYear);
    if (range) {
      const labelYear = String(schoolYear).trim();
      return {
        start: range.start,
        end: range.end,
        label: `Année scolaire ${labelYear}`,
        month: null,
        schoolYear: labelYear,
        view: 'year',
      };
    }
  }

  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const raw = (month && String(month).trim()) || fallback;
  const [y, m] = raw.split('-');
  const year = parseInt(y, 10);
  const mo = parseInt(m, 10);
  if (!year || !mo || mo < 1 || mo > 12) {
    return parsePeriod({ month: fallback, view: 'month' });
  }
  const start = new Date(year, mo - 1, 1);
  const end = new Date(year, mo, 0, 23, 59, 59, 999);
  return {
    start,
    end,
    label: `${String(mo).padStart(2, '0')}/${year}`,
    month: `${year}-${String(mo).padStart(2, '0')}`,
    schoolYear: null,
    view: 'month',
  };
}

function inferAccountType({ reference, note, description } = {}) {
  const text = `${reference || ''} ${note || ''} ${description || ''}`.toLowerCase();
  if (/\b(om|orange|orange\s*money)\b/.test(text) || text.includes('orange money')) return 'ORANGE_MONEY';
  if (/esp[eè]ces?|caisse|\bcash\b/.test(text)) return 'CASH';
  if (/banque|\bbank\b|virement|ch[eè]que/.test(text)) return 'BANK';
  if (/\bwave\b/.test(text)) return 'WAVE';
  return 'WAVE';
}

function inferIncomeCategory(feeTypeName) {
  const text = String(feeTypeName || '').toLowerCase();
  if (/cantine|repas|restauration/.test(text)) return INCOME_CATEGORY_CANTINE;
  if (/extra|activit[ée]|sortie|club|transport|uniforme/.test(text)) return INCOME_CATEGORY_EXTRAS;
  return INCOME_CATEGORY_SCOLARITE;
}

function accountTypeLabel(type) {
  return ACCOUNT_TYPE_LABELS[type] || type || '—';
}

async function addEntry({
  schoolId, type, amount, description, date, category, accountType, paymentId, source,
} = {}) {
  if (!schoolId || !type || !description) return { ok: false, error: 'data' };
  if (!ENTRY_TYPES.includes(type)) return { ok: false, error: 'type' };
  const amt = parseAmount(amount);
  if (!amt) return { ok: false, error: 'amount' };

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return { ok: false, error: 'school' };

  const entry = await prisma.accountingEntry.create({
    data: {
      schoolId,
      type,
      amount: amt,
      description: String(description).trim().slice(0, 500),
      date: parseDate(date),
      category: category ? String(category).trim().slice(0, 80) : null,
      accountType: ACCOUNT_TYPES.includes(accountType) ? accountType : null,
      paymentId: paymentId || null,
      source: SOURCES.includes(source) ? source : (source ? String(source).slice(0, 40) : null),
    },
    include: { school: true },
  });

  logger.info('accounting entry', { id: entry.id, schoolId, type, amount: amt });
  return { ok: true, entry };
}

async function getBalance(schoolId) {
  const where = schoolId ? { schoolId } : {};
  const [income, expense] = await Promise.all([
    prisma.accountingEntry.aggregate({ where: { ...where, type: 'INCOME' }, _sum: { amount: true } }),
    prisma.accountingEntry.aggregate({ where: { ...where, type: 'EXPENSE' }, _sum: { amount: true } }),
  ]);
  const totalIn = income._sum.amount || 0;
  const totalOut = expense._sum.amount || 0;
  return { ok: true, income: totalIn, expense: totalOut, balance: totalIn - totalOut };
}

async function getReport(schoolId, { from, to } = {}) {
  const dateFilter = dateRange(from, to);
  const where = {
    ...(schoolId ? { schoolId } : {}),
    ...(dateFilter ? { date: dateFilter } : {}),
  };

  const entries = await prisma.accountingEntry.findMany({
    where,
    include: { school: true },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });

  const income = entries.filter((e) => e.type === 'INCOME').reduce((sum, e) => sum + e.amount, 0);
  const expense = entries.filter((e) => e.type === 'EXPENSE').reduce((sum, e) => sum + e.amount, 0);

  return {
    ok: true,
    entries,
    totals: { income, expense, balance: income - expense },
  };
}

function summarizeTransactions(transactions) {
  const income = [];
  const expense = [];
  const byCategoryMap = new Map();
  const byAccountMap = new Map();

  for (const tx of transactions) {
    if (tx.type === 'INCOME') income.push(tx);
    else expense.push(tx);

    const catKey = tx.category?.id || (tx.type === 'INCOME' ? '_income' : '_expense');
    const catName = tx.category?.name || (tx.type === 'INCOME' ? 'Recettes (non classées)' : 'Dépenses (non classées)');
    const catKind = tx.category?.kind || tx.type;
    if (!byCategoryMap.has(catKey)) {
      byCategoryMap.set(catKey, { id: tx.category?.id || null, name: catName, kind: catKind, amount: 0 });
    }
    byCategoryMap.get(catKey).amount += tx.amount;

    const accKey = tx.account?.id || tx.accountId || '_none';
    if (!byAccountMap.has(accKey)) {
      byAccountMap.set(accKey, {
        id: tx.account?.id || tx.accountId || null,
        name: tx.account?.name || '—',
        type: tx.account?.type || null,
        income: 0,
        expense: 0,
      });
    }
    const acc = byAccountMap.get(accKey);
    if (tx.type === 'INCOME') acc.income += tx.amount;
    else acc.expense += tx.amount;
  }

  const totalIn = income.reduce((sum, t) => sum + t.amount, 0);
  const totalOut = expense.reduce((sum, t) => sum + t.amount, 0);

  return {
    income,
    expense,
    byCategory: [...byCategoryMap.values()].sort((a, b) => b.amount - a.amount),
    byAccount: [...byAccountMap.values()],
    totals: { totalIn, totalOut, net: totalIn - totalOut },
  };
}

async function getSchoolReport(schoolId, periodInput = {}) {
  if (!schoolId) return { ok: false, error: 'school' };
  const period = parsePeriod(periodInput);
  const transactions = await prisma.financeTransaction.findMany({
    where: { schoolId, createdAt: { gte: period.start, lte: period.end } },
    include: { account: true, category: true },
    orderBy: { createdAt: 'desc' },
  });
  const summary = summarizeTransactions(transactions);
  return { ok: true, period, transactions, ...summary };
}

async function recordMovement({
  schoolId,
  type,
  amount,
  accountId,
  categoryId,
  description,
  reference,
  paymentId,
  payrollRunId,
  date,
  source,
} = {}, tx) {
  if (!schoolId || !type || !description || !accountId) return { ok: false, error: 'data' };
  if (!ENTRY_TYPES.includes(type)) return { ok: false, error: 'type' };
  const amt = parseAmount(amount);
  if (!amt) return { ok: false, error: 'amount' };

  const work = async (client) => {
    if (paymentId) {
      const existing = await client.financeTransaction.findFirst({
        where: { schoolId, paymentId },
      });
      if (existing) return { ok: true, skipped: true, transaction: existing };
    }

    const account = await client.financeAccount.findFirst({
      where: { id: accountId, schoolId },
    });
    if (!account) return { ok: false, error: 'account' };

    let category = null;
    if (categoryId) {
      category = await client.expenseCategory.findFirst({
        where: { id: categoryId, schoolId },
      });
    }

    const transaction = await client.financeTransaction.create({
      data: {
        schoolId,
        type,
        amount: amt,
        accountId: account.id,
        categoryId: category?.id || null,
        description: String(description).trim().slice(0, 500),
        reference: reference ? String(reference).trim().slice(0, 120) : null,
        paymentId: paymentId || null,
        payrollRunId: payrollRunId || null,
      },
    });

    const delta = type === 'INCOME' ? amt : -amt;
    await client.financeAccount.update({
      where: { id: account.id },
      data: { balance: { increment: delta } },
    });

    await client.accountingEntry.create({
      data: {
        schoolId,
        type,
        amount: amt,
        description: String(description).trim().slice(0, 500),
        date: parseDate(date),
        category: category?.name || null,
        accountType: account.type,
        paymentId: paymentId || null,
        source: SOURCES.includes(source) ? source : 'MANUAL',
      },
    });

    logger.info('accounting movement', {
      id: transaction.id, schoolId, type, amount: amt, source: source || 'MANUAL',
    });
    return { ok: true, skipped: false, transaction };
  };

  if (tx) return work(tx);
  return prisma.$transaction(work);
}

async function recordValidatedPayment({ schoolId, payment } = {}) {
  if (!schoolId || !payment?.id || !payment.amount) return { ok: false, error: 'data' };

  const accountType = inferAccountType(payment);
  const accounts = await prisma.financeAccount.findMany({ where: { schoolId } });
  const account = accounts.find((a) => a.type === accountType)
    || accounts.find((a) => a.type === 'WAVE')
    || accounts[0];
  if (!account) return { ok: false, error: 'account' };

  const categoryName = inferIncomeCategory(payment.feeType?.name);
  const category = await prisma.expenseCategory.findFirst({
    where: { schoolId, name: categoryName, kind: 'INCOME' },
  });

  const studentName = [payment.student?.firstName, payment.student?.lastName].filter(Boolean).join(' ').trim();
  const feeLabel = payment.feeType?.name ? ` (${payment.feeType.name})` : '';
  const description = studentName
    ? `Paiement ${studentName}${feeLabel}`
    : `Paiement validé${feeLabel}`;

  return recordMovement({
    schoolId,
    type: 'INCOME',
    amount: payment.amount,
    accountId: account.id,
    categoryId: category?.id || null,
    description,
    reference: payment.reference || payment.id,
    paymentId: payment.id,
    date: payment.validatedAt || new Date(),
    source: 'PAYMENT',
  });
}

async function addScholarship({ studentId, type, amount } = {}) {
  if (!studentId || !type) return { ok: false, error: 'data' };
  const amt = parseAmount(amount);
  if (!amt) return { ok: false, error: 'amount' };

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return { ok: false, error: 'student' };

  const scholarship = await prisma.scholarship.create({
    data: {
      studentId,
      type: String(type).trim().slice(0, 80),
      amount: amt,
    },
    include: { student: { include: { school: true, class: true } } },
  });

  logger.info('scholarship created', { id: scholarship.id, studentId, amount: amt });
  return { ok: true, scholarship };
}

async function updateScholarshipStatus(id, status) {
  if (!id || !SCHOLARSHIP_STATUSES.includes(status)) return { ok: false, error: 'status' };
  const existing = await prisma.scholarship.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: 'data' };

  const scholarship = await prisma.scholarship.update({
    where: { id },
    data: { status },
    include: { student: { include: { school: true } } },
  });
  return { ok: true, scholarship };
}

async function listScholarships() {
  return prisma.scholarship.findMany({
    include: { student: { include: { school: true, class: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

module.exports = {
  addEntry,
  getBalance,
  getReport,
  getSchoolReport,
  recordMovement,
  recordValidatedPayment,
  addScholarship,
  updateScholarshipStatus,
  listScholarships,
  inferAccountType,
  inferIncomeCategory,
  parsePeriod,
  schoolYearRange,
  accountTypeLabel,
  summarizeTransactions,
  ENTRY_TYPES,
  SCHOLARSHIP_STATUSES,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  CATEGORY_KINDS,
  INCOME_CATEGORY_SCOLARITE,
  INCOME_CATEGORY_CANTINE,
  INCOME_CATEGORY_EXTRAS,
};
