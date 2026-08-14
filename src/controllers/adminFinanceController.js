const prisma = require('../config/database');
const {
  addEntry,
  getBalance,
  getReport,
  addScholarship,
  updateScholarshipStatus,
  listScholarships,
} = require('../../services/AccountingService');

const ERRORS = {
  data: 'Données invalides.',
  type: 'Type d\'écriture invalide.',
  amount: 'Montant invalide.',
  school: 'École introuvable.',
  student: 'Élève introuvable.',
  status: 'Statut de bourse invalide.',
};

function fail(res, path, error) {
  return res.redirect(`${path}?error=${error && ERRORS[error] ? error : 'data'}`);
}

async function accountingPage(req, res) {
  const schoolId = req.query.schoolId || null;
  const [schools, report, balance] = await Promise.all([
    prisma.school.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, city: true } }),
    getReport(schoolId || undefined, { from: req.query.from, to: req.query.to }),
    getBalance(schoolId || undefined),
  ]);

  res.render('admin/accounting', {
    user: req.user,
    schools,
    schoolId,
    entries: report.entries,
    totals: report.totals,
    balance: balance.balance,
    from: req.query.from || '',
    to: req.query.to || '',
    error: req.query.error || null,
    success: req.query.success || null,
    errors: ERRORS,
  });
}

async function createEntry(req, res) {
  const result = await addEntry({
    schoolId: req.body.schoolId,
    type: req.body.type,
    amount: req.body.amount,
    description: req.body.description,
    date: req.body.date,
  });
  if (!result.ok) return fail(res, '/admin/accounting', result.error);
  return res.redirect('/admin/accounting?success=1');
}

async function financeDashboard(req, res) {
  const [schools, payments, scholarships, globalBalance] = await Promise.all([
    prisma.school.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { students: true } } },
    }),
    prisma.payment.aggregate({ where: { status: 'VALIDATED' }, _sum: { amount: true }, _count: true }),
    listScholarships(),
    getBalance(),
  ]);

  const perSchool = await Promise.all(schools.map(async (school) => {
    const [balance, validated] = await Promise.all([
      getBalance(school.id),
      prisma.payment.aggregate({
        where: { status: 'VALIDATED', student: { schoolId: school.id } },
        _sum: { amount: true },
      }),
    ]);
    return {
      ...school,
      balance: balance.balance,
      income: balance.income,
      expense: balance.expense,
      payments: validated._sum.amount || 0,
    };
  }));

  const students = await prisma.student.findMany({
    include: { school: true, class: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 400,
  });

  const scholarshipStats = {
    pending: scholarships.filter((s) => s.status === 'PENDING').length,
    approved: scholarships.filter((s) => s.status === 'APPROVED').length,
    paid: scholarships.filter((s) => s.status === 'PAID').length,
    amount: scholarships
      .filter((s) => s.status === 'APPROVED' || s.status === 'PAID')
      .reduce((sum, s) => sum + s.amount, 0),
  };

  res.render('admin/financeDashboard', {
    user: req.user,
    schools: perSchool,
    students,
    scholarships,
    scholarshipStats,
    stats: {
      schools: schools.length,
      students: schools.reduce((sum, s) => sum + s._count.students, 0),
      paymentsTotal: payments._sum.amount || 0,
      paymentsCount: payments._count || 0,
      income: globalBalance.income,
      expense: globalBalance.expense,
      balance: globalBalance.balance,
    },
    error: req.query.error || null,
    success: req.query.success || null,
    errors: ERRORS,
  });
}

async function createScholarship(req, res) {
  const result = await addScholarship({
    studentId: req.body.studentId,
    type: req.body.type,
    amount: req.body.amount,
  });
  if (!result.ok) return fail(res, '/admin/finance', result.error);
  return res.redirect('/admin/finance?success=scholarship');
}

async function reviewScholarship(req, res) {
  const result = await updateScholarshipStatus(req.params.id, req.body.status);
  if (!result.ok) return fail(res, '/admin/finance', result.error);
  return res.redirect('/admin/finance?success=status');
}

module.exports = {
  accountingPage,
  createEntry,
  financeDashboard,
  createScholarship,
  reviewScholarship,
};
