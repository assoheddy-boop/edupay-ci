const crypto = require('crypto');
const prisma = require('../config/database');
const { formatMoney } = require('../middleware/currency');
const { sendNotification } = require('../../services/NotificationService');
const { generateReceiptPdf } = require('./documentPdf');

const CAISSE_SOURCE = 'CAISSE';
const PARENT_SOURCE = 'PARENT';
const IDEMPOTENCY_WINDOW_MS = 20_000;

const CAISSE_METHODS = ['CASH', 'WAVE', 'ORANGE_MONEY', 'BANK'];

const METHOD_LABELS = {
  CASH: 'Espèces',
  WAVE: 'Wave',
  ORANGE_MONEY: 'Orange Money',
  BANK: 'Banque',
};

function newIdempotencyKey() {
  return crypto.randomBytes(16).toString('hex');
}

function normalizeMethod(value) {
  const raw = String(value || 'CASH').trim().toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
  if (raw === 'CASH' || raw === 'ESPECES' || raw === 'ESP') return 'CASH';
  if (raw === 'WAVE') return 'WAVE';
  if (raw === 'OM' || raw === 'ORANGE' || raw === 'ORANGE_MONEY' || raw === 'ORANGEMONEY') {
    return 'ORANGE_MONEY';
  }
  if (raw === 'BANK' || raw === 'BANQUE') return 'BANK';
  return 'CASH';
}

function methodLabel(method) {
  return METHOD_LABELS[normalizeMethod(method)] || METHOD_LABELS.CASH;
}

function todayRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Abidjan',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const pick = (type) => parts.find((p) => p.type === type)?.value;
  const ymd = `${pick('year')}-${pick('month')}-${pick('day')}`;
  return {
    start: new Date(`${ymd}T00:00:00.000+00:00`),
    end: new Date(`${ymd}T23:59:59.999+00:00`),
  };
}

function sanitizeIdempotencyKey(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function caisseReference(key) {
  const clean = sanitizeIdempotencyKey(key);
  return clean ? `CAISSE-${clean}` : null;
}

function searchStudentWhere(schoolId, q) {
  const term = String(q || '').trim();
  const where = { schoolId };
  if (term) {
    where.OR = [
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { matricule: { contains: term, mode: 'insensitive' } },
    ];
  }
  return where;
}

async function searchStudents(schoolId, q, { take = 25 } = {}) {
  if (!schoolId) return [];
  const term = String(q || '').trim();
  if (!term) return [];
  return prisma.student.findMany({
    where: searchStudentWhere(schoolId, term),
    include: { class: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take,
  });
}

async function getStudentForSchool(schoolId, studentId) {
  if (!schoolId || !studentId) return null;
  return prisma.student.findFirst({
    where: { id: String(studentId), schoolId },
    include: { class: true },
  });
}

function summarizeTill(payments) {
  const list = Array.isArray(payments) ? payments : [];
  const byMethod = { CASH: 0, WAVE: 0, ORANGE_MONEY: 0, BANK: 0 };
  let total = 0;
  for (const payment of list) {
    const amount = Number(payment.amount) || 0;
    total += amount;
    const method = normalizeMethod(payment.method);
    byMethod[method] = (byMethod[method] || 0) + amount;
  }
  return { total, count: list.length, byMethod };
}

async function listTodayTill(schoolId, now = new Date()) {
  if (!schoolId) return { payments: [], totals: summarizeTill([]) };
  const { start, end } = todayRange(now);
  const payments = await prisma.payment.findMany({
    where: {
      source: CAISSE_SOURCE,
      status: 'VALIDATED',
      student: { schoolId },
      OR: [
        { validatedAt: { gte: start, lte: end } },
        { createdAt: { gte: start, lte: end } },
      ],
    },
    include: { student: { include: { class: true } }, feeType: true },
    orderBy: { createdAt: 'desc' },
  });
  return { payments, totals: summarizeTill(payments), start, end };
}

async function findDuplicateCaissePayment({ schoolId, studentId, amount, feeTypeId, method, reference }) {
  if (reference) {
    const byRef = await prisma.payment.findFirst({
      where: { reference, source: CAISSE_SOURCE, student: { schoolId } },
      include: { student: { include: { class: true } }, feeType: true },
    });
    if (byRef) return byRef;
  }
  const since = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS);
  return prisma.payment.findFirst({
    where: {
      studentId,
      amount,
      feeTypeId,
      method,
      source: CAISSE_SOURCE,
      status: 'VALIDATED',
      createdAt: { gte: since },
    },
    include: { student: { include: { class: true } }, feeType: true },
  });
}

async function writeAccountingIfEnabled(schoolId, payment) {
  const { isEnabled, getModuleMap, initFinanceDefaults } = require('../utils/modules');
  const mods = await getModuleMap(schoolId);
  if (!isEnabled(mods, 'accounting')) return { ok: true, skipped: true };
  await initFinanceDefaults(schoolId);
  const { recordValidatedPayment } = require('../../services/AccountingService');
  return recordValidatedPayment({ schoolId, payment });
}

async function notifyParents(schoolId, payment) {
  const parents = await prisma.parentStudent.findMany({
    where: { studentId: payment.studentId },
    include: { parent: { include: { user: true } } },
  });
  const amountLabel = formatMoney(payment.amount);
  const studentName = payment.student?.firstName || 'l’élève';
  const message = `${amountLabel} encaissés au secrétariat pour ${studentName}. Reçu disponible.`;
  for (const ps of parents) {
    if (!ps.parent?.userId) continue;
    await sendNotification(ps.parent.userId, 'payment_validated', message, { schoolId });
  }
}

async function attachReceipt(payment, school) {
  try {
    const { pdfUrl } = await generateReceiptPdf({
      payment,
      student: payment.student,
      school,
      feeType: payment.feeType,
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { receiptUrl: pdfUrl },
    });
    return { ...payment, receiptUrl: pdfUrl };
  } catch (err) {
    console.error('[caisse] receipt pdf', err?.message || err);
    return payment;
  }
}

async function createCaissePayment({ school, body = {} } = {}) {
  const schoolId = school?.id;
  if (!schoolId) return { ok: false, error: 'forbidden', status: 403 };

  const studentId = String(body.studentId || '').trim();
  const feeTypeId = String(body.feeTypeId || '').trim();
  const amount = parseInt(body.amount, 10);
  const method = normalizeMethod(body.method);
  const note = String(body.note || '').trim().slice(0, 500) || null;
  const reference = caisseReference(body.idempotencyKey);

  if (!studentId || !feeTypeId || !Number.isFinite(amount) || amount < 100) {
    return { ok: false, error: 'data' };
  }

  const student = await getStudentForSchool(schoolId, studentId);
  if (!student) return { ok: false, error: 'forbidden', status: 403 };

  const feeType = await prisma.feeType.findFirst({
    where: { id: feeTypeId, schoolId },
  });
  if (!feeType) return { ok: false, error: 'fee' };

  const duplicate = await findDuplicateCaissePayment({
    schoolId,
    studentId,
    amount,
    feeTypeId,
    method,
    reference,
  });
  if (duplicate) return { ok: true, duplicate: true, payment: duplicate };

  const now = new Date();
  let payment = await prisma.payment.create({
    data: {
      studentId,
      feeTypeId,
      amount,
      status: 'VALIDATED',
      source: CAISSE_SOURCE,
      method,
      note,
      reference,
      validatedAt: now,
    },
    include: { student: { include: { class: true } }, feeType: true },
  });

  payment = await attachReceipt(payment, school);

  try {
    const { delCache } = require('../../services/cache');
    await delCache(`stats:school:${schoolId}`);
  } catch {
    // cache optional
  }

  await writeAccountingIfEnabled(schoolId, payment);
  await notifyParents(schoolId, payment);

  return { ok: true, duplicate: false, payment };
}

async function getCaisseTicket(schoolId, paymentId) {
  if (!schoolId || !paymentId) return { ok: false, error: 'forbidden', status: 403 };
  const payment = await prisma.payment.findFirst({
    where: {
      id: String(paymentId),
      source: CAISSE_SOURCE,
      student: { schoolId },
    },
    include: { student: { include: { class: true } }, feeType: true },
  });
  if (!payment) return { ok: false, error: 'forbidden', status: 403 };
  return { ok: true, payment };
}

module.exports = {
  CAISSE_SOURCE,
  PARENT_SOURCE,
  CAISSE_METHODS,
  METHOD_LABELS,
  newIdempotencyKey,
  normalizeMethod,
  methodLabel,
  todayRange,
  caisseReference,
  searchStudents,
  getStudentForSchool,
  summarizeTill,
  listTodayTill,
  createCaissePayment,
  getCaisseTicket,
};
