const prisma = require('../config/database');
const { initFinanceDefaults } = require('../utils/modules');
const {
  recordMovement,
  getSchoolReport,
  parsePeriod,
  accountTypeLabel,
  ACCOUNT_TYPE_LABELS,
} = require('../../services/AccountingService');
const { buildWorkbook, sendExcel } = require('../services/exportExcel');
const { generateAccountingReportPdf } = require('../../services/export');
const { sendPdfDownload } = require('../utils/pdfOutput');

function queryPeriod(req) {
  return parsePeriod({
    month: req.query.month,
    schoolYear: req.query.schoolYear,
    view: req.query.view,
  });
}

function periodQuery(period) {
  const params = new URLSearchParams();
  if (period.view === 'year' && period.schoolYear) {
    params.set('view', 'year');
    params.set('schoolYear', period.schoolYear);
  } else if (period.month) {
    params.set('view', 'month');
    params.set('month', period.month);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function loadDashboardData(req) {
  const schoolId = req.user.school.id;
  await initFinanceDefaults(schoolId);
  const period = queryPeriod(req);
  const schoolYear = period.schoolYear || req.user.school.currentSchoolYear;

  const [accounts, categories, report, paymentsValidated, invoices, budgetReport] = await Promise.all([
    prisma.financeAccount.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
    prisma.expenseCategory.findMany({ where: { schoolId }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] }),
    getSchoolReport(schoolId, period),
    prisma.payment.aggregate({
      where: {
        status: 'VALIDATED',
        student: { class: { schoolId } },
        validatedAt: { gte: period.start, lte: period.end },
      },
      _sum: { amount: true },
    }),
    prisma.supplierInvoice.findMany({
      where: { schoolId },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    require('../services/accountingExtras').getBudgetReport(schoolId, schoolYear, period),
  ]);

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  return {
    accounts,
    categories,
    report,
    period: report.period,
    schoolYear,
    stats: {
      totalBalance,
      periodIncome: report.totals.totalIn,
      periodExpense: report.totals.totalOut,
      paymentsTotal: paymentsValidated._sum.amount || 0,
    },
    invoices,
    budgetReport,
  };
}

async function dashboard(req, res) {
  const data = await loadDashboardData(req);
  res.render('school/accounting/dashboard', {
    user: req.user,
    school: req.user.school,
    accounts: data.accounts,
    categories: data.categories,
    transactions: data.report.transactions.slice(0, 20),
    byCategory: data.report.byCategory,
    byAccount: data.report.byAccount,
    period: data.period,
    schoolYear: data.schoolYear,
    periodQs: periodQuery(data.period),
    accountTypeLabel,
    accountTypeLabels: ACCOUNT_TYPE_LABELS,
    stats: data.stats,
    invoices: data.invoices,
    budgetReport: data.budgetReport,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function addTransaction(req, res) {
  const schoolId = req.user.school.id;
  await initFinanceDefaults(schoolId);
  const result = await recordMovement({
    schoolId,
    type: req.body.type,
    amount: req.body.amount,
    accountId: req.body.accountId,
    categoryId: req.body.categoryId || null,
    description: req.body.description,
    reference: req.body.reference,
    date: req.body.date || new Date(),
    source: 'MANUAL',
  });

  if (!result.ok) {
    return res.redirect(`/school/accounting?error=${result.error || 'data'}`);
  }
  res.redirect('/school/accounting?success=1');
}

async function report(req, res) {
  const schoolId = req.user.school.id;
  await initFinanceDefaults(schoolId);
  const data = await getSchoolReport(schoolId, queryPeriod(req));
  const accounts = await prisma.financeAccount.findMany({ where: { schoolId }, orderBy: { name: 'asc' } });

  res.render('school/accounting/report', {
    user: req.user,
    school: req.user.school,
    period: data.period,
    periodQs: periodQuery(data.period),
    income: data.income,
    expense: data.expense,
    byCategory: data.byCategory,
    byAccount: data.byAccount,
    accounts,
    totals: data.totals,
    accountTypeLabel,
  });
}

function exportRows(income, expense) {
  const typeLabel = (t) => (t === 'INCOME' ? 'Recette' : 'Dépense');
  const rows = [];
  income.forEach((t) => {
    rows.push({
      date: new Date(t.createdAt).toLocaleDateString('fr-FR'),
      type: typeLabel(t.type),
      description: t.description,
      category: t.category?.name || 'Scolarité / recettes',
      account: t.account?.name || '—',
      amount: t.amount,
    });
  });
  expense.forEach((t) => {
    rows.push({
      date: new Date(t.createdAt).toLocaleDateString('fr-FR'),
      type: typeLabel(t.type),
      description: t.description,
      category: t.category?.name || '—',
      account: t.account?.name || '—',
      amount: t.amount,
    });
  });
  return rows;
}

async function exportExcel(req, res) {
  const schoolId = req.user.school.id;
  await initFinanceDefaults(schoolId);
  const data = await getSchoolReport(schoolId, queryPeriod(req));
  const wb = await buildWorkbook(
    'Comptabilité',
    [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Catégorie', key: 'category', width: 22 },
      { header: 'Compte', key: 'account', width: 18 },
      { header: 'Montant (FCFA)', key: 'amount', width: 16 },
    ],
    exportRows(data.income, data.expense),
  );
  const slug = (data.period.schoolYear || data.period.month || 'periode').replace(/\s+/g, '-');
  await sendExcel(res, `comptabilite-educonnect-${slug}.xlsx`, wb);
}

async function exportPdf(req, res) {
  const schoolId = req.user.school.id;
  await initFinanceDefaults(schoolId);
  const data = await getSchoolReport(schoolId, queryPeriod(req));
  const result = await generateAccountingReportPdf({
    school: req.user.school,
    periodLabel: data.period.label,
    totals: data.totals,
    income: data.income,
    expense: data.expense,
    byCategory: data.byCategory,
  });
  if (!result.ok) return res.redirect(`/school/accounting/report${periodQuery(data.period)}`);
  return sendPdfDownload(res, result);
}

const extras = require('../services/accountingExtras');

async function createAccount(req, res) {
  const result = await extras.createAccount({
    schoolId: req.user.school.id,
    name: req.body.name,
    type: req.body.type,
  });
  res.redirect(`/school/accounting?${result.ok ? 'success=account' : 'error=data'}`);
}

async function updateAccount(req, res) {
  const result = await extras.updateAccount({
    schoolId: req.user.school.id,
    accountId: req.params.id,
    name: req.body.name,
    type: req.body.type,
  });
  res.redirect(`/school/accounting?${result.ok ? 'success=account' : 'error=account'}`);
}

async function createCategory(req, res) {
  const result = await extras.createCategory({
    schoolId: req.user.school.id,
    name: req.body.name,
    kind: req.body.kind,
  });
  res.redirect(`/school/accounting?${result.ok ? 'success=category' : 'error=data'}`);
}

async function updateCategory(req, res) {
  const result = await extras.updateCategory({
    schoolId: req.user.school.id,
    categoryId: req.params.id,
    name: req.body.name,
    kind: req.body.kind,
  });
  res.redirect(`/school/accounting?${result.ok ? 'success=category' : 'error=category'}`);
}

async function createInvoice(req, res) {
  const result = await extras.createSupplierInvoice({
    schoolId: req.user.school.id,
    supplierName: req.body.supplierName,
    amount: req.body.amount,
    description: req.body.description,
    reference: req.body.reference,
    dueDate: req.body.dueDate,
    categoryId: req.body.categoryId,
  });
  res.redirect(`/school/accounting?${result.ok ? 'success=invoice' : 'error=data'}`);
}

async function payInvoice(req, res) {
  const result = await extras.paySupplierInvoice({
    schoolId: req.user.school.id,
    invoiceId: req.params.id,
    accountId: req.body.accountId,
  });
  res.redirect(`/school/accounting?${result.ok ? 'success=invoice_paid' : 'error=invoice'}`);
}

async function cancelInvoice(req, res) {
  const result = await extras.cancelSupplierInvoice({
    schoolId: req.user.school.id,
    invoiceId: req.params.id,
  });
  res.redirect(`/school/accounting?${result.ok ? 'success=invoice_cancelled' : 'error=invoice'}`);
}

async function saveBudgetLine(req, res) {
  const result = await extras.upsertBudgetLine({
    schoolId: req.user.school.id,
    schoolYear: req.body.schoolYear,
    categoryId: req.body.categoryId,
    plannedAmount: req.body.plannedAmount,
  });
  res.redirect(`/school/accounting?${result.ok ? 'success=budget' : 'error=data'}`);
}

module.exports = {
  dashboard,
  addTransaction,
  report,
  exportExcel,
  exportPdf,
  createAccount,
  updateAccount,
  createCategory,
  updateCategory,
  createInvoice,
  payInvoice,
  cancelInvoice,
  saveBudgetLine,
};
