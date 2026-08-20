const prisma = require('../config/database');
const { initFinanceDefaults } = require('../utils/modules');
const { recordMovement } = require('../../services/AccountingService');

const ACCOUNT_TYPES = ['WAVE', 'ORANGE_MONEY', 'CASH', 'BANK'];

async function createAccount({ schoolId, name, type }) {
  if (!schoolId || !name || !ACCOUNT_TYPES.includes(type)) return { ok: false, error: 'data' };
  const account = await prisma.financeAccount.create({
    data: { schoolId, name: String(name).trim().slice(0, 80), type },
  });
  return { ok: true, account };
}

async function updateAccount({ schoolId, accountId, name, type }) {
  const account = await prisma.financeAccount.findFirst({ where: { id: accountId, schoolId } });
  if (!account) return { ok: false, error: 'account' };
  const data = {};
  if (name) data.name = String(name).trim().slice(0, 80);
  if (type && ACCOUNT_TYPES.includes(type)) data.type = type;
  const updated = await prisma.financeAccount.update({ where: { id: account.id }, data });
  return { ok: true, account: updated };
}

async function createCategory({ schoolId, name, kind }) {
  const k = kind === 'INCOME' ? 'INCOME' : 'EXPENSE';
  if (!schoolId || !name) return { ok: false, error: 'data' };
  const category = await prisma.expenseCategory.create({
    data: { schoolId, name: String(name).trim().slice(0, 80), kind: k },
  });
  return { ok: true, category };
}

async function updateCategory({ schoolId, categoryId, name, kind }) {
  const category = await prisma.expenseCategory.findFirst({ where: { id: categoryId, schoolId } });
  if (!category) return { ok: false, error: 'category' };
  const data = {};
  if (name) data.name = String(name).trim().slice(0, 80);
  if (kind === 'INCOME' || kind === 'EXPENSE') data.kind = kind;
  const updated = await prisma.expenseCategory.update({ where: { id: category.id }, data });
  return { ok: true, category: updated };
}

async function createSupplierInvoice({
  schoolId, supplierName, amount, description, reference, dueDate, categoryId,
}) {
  const amt = parseInt(amount, 10);
  if (!schoolId || !supplierName || !Number.isFinite(amt) || amt <= 0) {
    return { ok: false, error: 'data' };
  }
  const invoice = await prisma.supplierInvoice.create({
    data: {
      schoolId,
      supplierName: String(supplierName).trim().slice(0, 120),
      amount: amt,
      description: description ? String(description).trim().slice(0, 500) : null,
      reference: reference ? String(reference).trim().slice(0, 120) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      categoryId: categoryId || null,
      status: 'PENDING',
    },
  });
  return { ok: true, invoice };
}

async function paySupplierInvoice({ schoolId, invoiceId, accountId }) {
  const invoice = await prisma.supplierInvoice.findFirst({
    where: { id: invoiceId, schoolId, status: 'PENDING' },
  });
  if (!invoice) return { ok: false, error: 'invoice' };

  await initFinanceDefaults(schoolId);
  const movement = await recordMovement({
    schoolId,
    type: 'EXPENSE',
    amount: invoice.amount,
    accountId,
    categoryId: invoice.categoryId,
    description: `Facture ${invoice.supplierName}${invoice.description ? ` — ${invoice.description}` : ''}`,
    reference: invoice.reference || invoice.id,
    source: 'MANUAL',
    supplierInvoiceId: invoice.id,
  });
  if (!movement.ok) return { ok: false, error: movement.error || 'accounting' };

  const paid = await prisma.supplierInvoice.update({
    where: { id: invoice.id },
    data: { status: 'PAID', paidAt: new Date() },
  });
  return { ok: true, invoice: paid };
}

async function cancelSupplierInvoice({ schoolId, invoiceId }) {
  const invoice = await prisma.supplierInvoice.findFirst({
    where: { id: invoiceId, schoolId, status: 'PENDING' },
  });
  if (!invoice) return { ok: false, error: 'invoice' };
  await prisma.supplierInvoice.update({
    where: { id: invoice.id },
    data: { status: 'CANCELLED' },
  });
  return { ok: true };
}

async function upsertBudgetLine({ schoolId, schoolYear, categoryId, plannedAmount }) {
  const amt = parseInt(plannedAmount, 10);
  if (!schoolId || !schoolYear || !categoryId || !Number.isFinite(amt) || amt < 0) {
    return { ok: false, error: 'data' };
  }
  const category = await prisma.expenseCategory.findFirst({ where: { id: categoryId, schoolId } });
  if (!category) return { ok: false, error: 'category' };

  const line = await prisma.budgetLine.upsert({
    where: { schoolId_schoolYear_categoryId: { schoolId, schoolYear, categoryId } },
    create: { schoolId, schoolYear, categoryId, plannedAmount: amt },
    update: { plannedAmount: amt },
  });
  return { ok: true, line };
}

async function getBudgetReport(schoolId, schoolYear, period) {
  const { getSchoolReport } = require('../../services/AccountingService');
  const [lines, report, socialCases] = await Promise.all([
    prisma.budgetLine.findMany({
      where: { schoolId, schoolYear },
      include: { category: true },
      orderBy: { category: { name: 'asc' } },
    }),
    getSchoolReport(schoolId, { view: 'year', schoolYear }),
    prisma.socialCase.findMany({
      where: { schoolId, status: 'actif' },
      include: { student: { include: { class: true } } },
    }),
  ]);

  const actualByCategory = new Map();
  for (const row of report.byCategory || []) {
    if (row.id) actualByCategory.set(row.id, row.amount);
  }

  const budgetRows = lines.map((line) => {
    const actual = actualByCategory.get(line.categoryId) || 0;
    return {
      categoryId: line.categoryId,
      categoryName: line.category.name,
      kind: line.category.kind,
      planned: line.plannedAmount,
      actual,
      variance: line.plannedAmount - actual,
    };
  });

  const socialImpact = socialCases.reduce((sum, sc) => {
    if (sc.discountType === 'FIXED') return sum + (sc.discountValue || 0);
    return sum;
  }, 0);

  return {
    schoolYear,
    budgetRows,
    totals: {
      planned: budgetRows.reduce((s, r) => s + r.planned, 0),
      actual: report.totals?.totalIn || 0,
      expense: report.totals?.totalOut || 0,
      socialDiscountEstimate: socialImpact,
    },
    socialCasesCount: socialCases.length,
    period: report.period,
  };
}

module.exports = {
  createAccount,
  updateAccount,
  createCategory,
  updateCategory,
  createSupplierInvoice,
  paySupplierInvoice,
  cancelSupplierInvoice,
  upsertBudgetLine,
  getBudgetReport,
  ACCOUNT_TYPES,
};
