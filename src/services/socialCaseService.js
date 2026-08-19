const prisma = require('../config/database');
const { searchStudents, getStudentForSchool } = require('./caisseService');

const STATUS_ACTIF = 'actif';
const STATUS_CLOS = 'clos';
const STATUSES = [STATUS_ACTIF, STATUS_CLOS];

const MOTIFS = [
  { value: 'orphelin', label: 'Orphelin' },
  { value: 'precarite', label: 'Précarité' },
  { value: 'famille_nombreuse', label: 'Famille nombreuse' },
  { value: 'autre', label: 'Autre' },
];

const MOTIF_VALUES = MOTIFS.map((m) => m.value);
const MOTIF_LABELS = Object.fromEntries(MOTIFS.map((m) => [m.value, m.label]));

const DISCOUNT_TYPES = ['PERCENT', 'FIXED'];

function motifLabel(value) {
  return MOTIF_LABELS[value] || value || '—';
}

function normalizeStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  return STATUSES.includes(raw) ? raw : STATUS_ACTIF;
}

function normalizeDiscountType(value) {
  const raw = String(value || 'PERCENT').trim().toUpperCase();
  if (raw === 'FIXED' || raw === 'FIXE' || raw === 'FCFA') return 'FIXED';
  return 'PERCENT';
}

function normalizeMotif(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
  if (raw === 'orphelin') return 'orphelin';
  if (raw === 'precarite' || raw === 'precarite_sociale') return 'precarite';
  if (raw === 'famille_nombreuse' || raw === 'famille') return 'famille_nombreuse';
  if (raw === 'autre') return 'autre';
  return null;
}

function applyDiscount(amount, socialCase) {
  const catalog = Math.max(0, Math.round(Number(amount) || 0));
  if (!socialCase || socialCase.status !== STATUS_ACTIF) return catalog;
  const value = Math.max(0, Number(socialCase.discountValue) || 0);
  const type = normalizeDiscountType(socialCase.discountType);
  if (type === 'PERCENT') {
    const pct = Math.min(100, value);
    return Math.round(catalog * (1 - pct / 100));
  }
  return Math.max(0, catalog - Math.round(value));
}

function discountLabel(socialCase) {
  if (!socialCase) return null;
  const value = Number(socialCase.discountValue) || 0;
  if (normalizeDiscountType(socialCase.discountType) === 'PERCENT') {
    return `${value} %`;
  }
  return `${value.toLocaleString('fr-FR')} FCFA`;
}

function allocateDue(catalogAmounts, totalDue) {
  const catalogs = Array.isArray(catalogAmounts) ? catalogAmounts.map((n) => Math.max(0, Math.round(Number(n) || 0))) : [];
  const dueTotal = Math.max(0, Math.round(Number(totalDue) || 0));
  const catalogSum = catalogs.reduce((sum, n) => sum + n, 0);
  if (!catalogs.length) return [];
  if (catalogSum <= 0) return catalogs.map(() => 0);
  const shares = [];
  let allocated = 0;
  for (let i = 0; i < catalogs.length; i += 1) {
    if (i === catalogs.length - 1) {
      shares.push(Math.max(0, dueTotal - allocated));
    } else {
      const share = Math.round((catalogs[i] / catalogSum) * dueTotal);
      shares.push(share);
      allocated += share;
    }
  }
  return shares;
}

function parseInstallmentsJson(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function ymd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildInstallments({ count, firstDueDate, totalDue, dueDates } = {}) {
  const total = Math.max(0, Math.round(Number(totalDue) || 0));
  const dates = Array.isArray(dueDates)
    ? dueDates.map((d) => parseDateOnly(d)).filter(Boolean)
    : [];

  let n = parseInt(count, 10);
  if (dates.length >= 2) n = dates.length;
  if (!Number.isFinite(n) || n < 2 || n > 12) return null;

  const start = parseDateOnly(firstDueDate);
  if (!dates.length && !start) return null;

  const base = n > 0 ? Math.floor(total / n) : 0;
  const remainder = total - base * n;
  const items = [];
  for (let i = 0; i < n; i += 1) {
    let due = dates[i] || null;
    if (!due && start) {
      due = new Date(start);
      due.setUTCMonth(due.getUTCMonth() + i);
    }
    items.push({
      n: i + 1,
      dueDate: ymd(due),
      amount: base + (i === n - 1 ? remainder : 0),
    });
  }
  return items;
}

function studentInclude() {
  return { class: true };
}

async function getActiveCase({ schoolId, studentId }) {
  if (!schoolId || !studentId) return null;
  return prisma.socialCase.findFirst({
    where: { schoolId, studentId, status: STATUS_ACTIF },
    include: { student: { include: studentInclude() } },
    orderBy: { createdAt: 'desc' },
  });
}

async function listCases({ schoolId, status, q } = {}) {
  if (!schoolId) return [];
  const where = { schoolId };
  const st = String(status || '').trim().toLowerCase();
  if (STATUSES.includes(st)) where.status = st;
  const term = String(q || '').trim();
  if (term) {
    where.student = {
      schoolId,
      OR: [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { matricule: { contains: term, mode: 'insensitive' } },
      ],
    };
  }
  return prisma.socialCase.findMany({
    where,
    include: { student: { include: studentInclude() } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });
}

async function getStudentFeeBalance({ schoolId, studentId }) {
  if (!schoolId || !studentId) {
    return { ok: false, error: 'forbidden', status: 403 };
  }

  const student = await getStudentForSchool(schoolId, studentId);
  if (!student) return { ok: false, error: 'forbidden', status: 403 };

  const [feeTypes, payments, socialCase] = await Promise.all([
    prisma.feeType.findMany({
      where: { schoolId, isActive: true },
      orderBy: { name: 'asc' },
    }),
    prisma.payment.findMany({
      where: { studentId, status: 'VALIDATED' },
      select: { amount: true, feeTypeId: true },
    }),
    getActiveCase({ schoolId, studentId }),
  ]);

  const paidByFee = {};
  let totalPaid = 0;
  for (const payment of payments) {
    const amount = Number(payment.amount) || 0;
    totalPaid += amount;
    const key = payment.feeTypeId || '_none';
    paidByFee[key] = (paidByFee[key] || 0) + amount;
  }

  const linesCatalog = feeTypes.map((fee) => Number(fee.amount) || 0);
  const totalCatalog = linesCatalog.reduce((sum, n) => sum + n, 0);
  const totalDue = applyDiscount(totalCatalog, socialCase);
  const dueShares = allocateDue(linesCatalog, totalDue);

  const lines = feeTypes.map((fee, index) => {
    const catalog = linesCatalog[index];
    const due = dueShares[index];
    const paid = paidByFee[fee.id] || 0;
    const remaining = Math.max(0, due - paid);
    return {
      feeTypeId: fee.id,
      name: fee.name,
      catalog,
      due,
      paid,
      remaining,
    };
  });
  const allocatedPaid = lines.reduce((sum, line) => sum + line.paid, 0);
  const unallocatedPaid = Math.max(0, totalPaid - allocatedPaid);
  const totalRemaining = Math.max(0, totalDue - totalPaid);

  return {
    ok: true,
    student,
    socialCase,
    lines,
    totalCatalog,
    totalDue,
    totalPaid,
    unallocatedPaid,
    totalRemaining,
    hasRemise: Boolean(socialCase),
  };
}

async function createCase({ school, body = {} } = {}) {
  const schoolId = school?.id;
  if (!schoolId) return { ok: false, error: 'forbidden', status: 403 };

  const studentId = String(body.studentId || '').trim();
  const motif = normalizeMotif(body.motif);
  const motifDetail = String(body.motifDetail || '').trim().slice(0, 300) || null;
  const notes = String(body.notes || '').trim().slice(0, 1000) || null;
  const discountType = normalizeDiscountType(body.discountType);
  const discountValue = parseInt(body.discountValue, 10);

  if (!studentId || !motif) return { ok: false, error: 'data' };
  if (motif === 'autre' && !motifDetail) return { ok: false, error: 'motif' };
  if (!Number.isFinite(discountValue) || discountValue < 0) return { ok: false, error: 'remise' };
  if (discountType === 'PERCENT' && (discountValue < 1 || discountValue > 100)) {
    return { ok: false, error: 'remise' };
  }
  if (discountType === 'FIXED' && discountValue < 100) {
    return { ok: false, error: 'remise' };
  }

  const student = await getStudentForSchool(schoolId, studentId);
  if (!student) return { ok: false, error: 'forbidden', status: 403 };

  const existing = await getActiveCase({ schoolId, studentId });
  if (existing) return { ok: false, error: 'exists' };

  const draftCase = {
    status: STATUS_ACTIF,
    discountType,
    discountValue,
  };
  const feeTypes = await prisma.feeType.findMany({
    where: { schoolId, isActive: true },
    select: { amount: true },
  });
  const totalCatalog = feeTypes.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0);
  const totalDue = applyDiscount(totalCatalog, draftCase);
  const dueDates = Array.isArray(body.dueDates) ? body.dueDates : String(body.dueDates || '').split(/[,\s]+/);
  const installments = buildInstallments({
    count: body.installmentCount,
    firstDueDate: body.firstDueDate,
    totalDue,
    dueDates,
  });

  const socialCase = await prisma.socialCase.create({
    data: {
      schoolId,
      studentId,
      motif,
      motifDetail,
      discountType,
      discountValue,
      notes,
      status: STATUS_ACTIF,
      ...(installments ? { installments } : {}),
    },
    include: { student: { include: studentInclude() } },
  });

  return { ok: true, socialCase };
}

async function closeCase({ schoolId, id } = {}) {
  if (!schoolId || !id) return { ok: false, error: 'forbidden', status: 403 };
  const socialCase = await prisma.socialCase.findFirst({
    where: { id: String(id), schoolId },
    include: { student: { include: studentInclude() } },
  });
  if (!socialCase) return { ok: false, error: 'forbidden', status: 403 };
  if (socialCase.status === STATUS_CLOS) return { ok: true, socialCase, alreadyClosed: true };

  const updated = await prisma.socialCase.update({
    where: { id: socialCase.id },
    data: { status: STATUS_CLOS },
    include: { student: { include: studentInclude() } },
  });
  return { ok: true, socialCase: updated };
}

async function mapActiveCasesByStudent(schoolId, studentIds) {
  const ids = [...new Set((studentIds || []).filter(Boolean))];
  if (!schoolId || !ids.length) return {};
  const cases = await prisma.socialCase.findMany({
    where: { schoolId, studentId: { in: ids }, status: STATUS_ACTIF },
    orderBy: { createdAt: 'desc' },
  });
  const map = {};
  for (const socialCase of cases) {
    if (!map[socialCase.studentId]) map[socialCase.studentId] = socialCase;
  }
  return map;
}

module.exports = {
  STATUS_ACTIF,
  STATUS_CLOS,
  STATUSES,
  MOTIFS,
  MOTIF_VALUES,
  DISCOUNT_TYPES,
  motifLabel,
  discountLabel,
  applyDiscount,
  allocateDue,
  buildInstallments,
  parseInstallmentsJson,
  searchStudents,
  getStudentForSchool,
  getActiveCase,
  listCases,
  getStudentFeeBalance,
  createCase,
  closeCase,
  mapActiveCasesByStudent,
};
