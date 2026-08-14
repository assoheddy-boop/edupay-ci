const prisma = require('../src/config/database');
const logger = require('./logger');

const ENTRY_TYPES = ['INCOME', 'EXPENSE'];
const SCHOLARSHIP_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'PAID'];

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

async function addEntry({ schoolId, type, amount, description, date } = {}) {
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
  addScholarship,
  updateScholarshipStatus,
  listScholarships,
  ENTRY_TYPES,
  SCHOLARSHIP_STATUSES,
};
