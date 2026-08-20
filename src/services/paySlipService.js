const prisma = require('../config/database');
const { mergeSchoolRubriques } = require('../config/paySlipRubriques');

function monthBounds(month, year) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { start, end };
}

function nextMonthFirstDay(month, year) {
  const d = new Date(year, month, 1);
  return d;
}

function formatRateLabel(rate) {
  if (rate == null || !Number.isFinite(rate)) return '';
  const s = Number(rate).toFixed(1).replace(/\.0$/, '');
  return `${s.replace('.', ',')}%`;
}

function roundAmount(n) {
  return Math.round(Number(n) || 0);
}

/** Estimation CN / IGR simplifiée (barème indicatif, surcharge école possible). */
function estimateCn({ taxableBase, taxParts = 1 }) {
  const parts = Math.max(1, taxParts || 1);
  const quotient = taxableBase / parts;
  if (quotient <= 50000) return 0;
  if (quotient <= 130000) return roundAmount(quotient * 0.015);
  if (quotient <= 200000) return roundAmount(quotient * 0.05);
  return roundAmount(quotient * 0.1);
}

function estimateIgr({ taxableBase, taxParts = 1, cn = 0, is = 0 }) {
  const netImposable = Math.max(0, taxableBase - cn - is);
  const parts = Math.max(1, taxParts || 1);
  const quotient = netImposable / parts;
  if (quotient <= 30000) return 0;
  if (quotient <= 50000) return roundAmount(quotient * 0.05);
  if (quotient <= 80000) return roundAmount(quotient * 0.1);
  if (quotient <= 120000) return roundAmount(quotient * 0.15);
  return roundAmount(quotient * 0.2);
}

async function loadSchoolRubriques(schoolId) {
  const overrides = await prisma.schoolPayRubrique.findMany({ where: { schoolId } });
  return mergeSchoolRubriques(overrides);
}

function buildPayslipLines({ profile, rubriques, advances = 0, bonuses = 0, extraDeductions = 0 }) {
  const baseSalary = profile.baseSalary || 0;
  const sursalaire = profile.sursalaire || 0;
  const transport = profile.transportAllowance || 0;
  const taxableBase = baseSalary;
  const taxParts = profile.taxParts || 1;
  const rubMap = new Map(rubriques.map((r) => [r.code, r]));
  const lines = [];

  function addLine(code, data) {
    const def = rubMap.get(code);
    if (!def) return;
    lines.push({
      code,
      label: def.label,
      base: data.base ?? null,
      rate: data.rate ?? null,
      rateLabel: data.rateLabel ?? (data.rate != null ? formatRateLabel(data.rate) : ''),
      gains: data.gains || 0,
      deductions: data.deductions || 0,
      block: def.block,
      category: def.category,
      sortOrder: def.sortOrder,
    });
  }

  if (baseSalary > 0) {
    addLine('100', { base: baseSalary, gains: baseSalary });
  }
  if (sursalaire > 0) {
    addLine('110', { base: sursalaire, gains: sursalaire });
  }
  if (bonuses > 0) {
    addLine('210', { base: bonuses, gains: bonuses });
  }

  const anciennete = rubMap.get('211');
  if (anciennete?.rate && baseSalary > 0) {
    const amount = roundAmount(baseSalary * anciennete.rate / 100);
    addLine('211', {
      base: baseSalary,
      rate: anciennete.rate,
      rateLabel: formatRateLabel(anciennete.rate),
      gains: amount,
    });
  }

  addLine('212', { gains: 0 });
  addLine('213', { gains: 0 });

  const cnps = rubMap.get('810');
  if (cnps?.rate && taxableBase > 0) {
    addLine('810', {
      base: taxableBase,
      rate: cnps.rate,
      rateLabel: formatRateLabel(cnps.rate),
      deductions: roundAmount(taxableBase * cnps.rate / 100),
    });
  }

  const isRub = rubMap.get('820');
  if (isRub?.rate && taxableBase > 0) {
    addLine('820', {
      base: taxableBase,
      rate: isRub.rate,
      rateLabel: formatRateLabel(isRub.rate),
      deductions: roundAmount(taxableBase * isRub.rate / 100),
    });
  }

  const cnRub = rubMap.get('835');
  const isLine = lines.find((l) => l.code === '820');
  const cnAmount = cnRub?.fixedAmount != null
    ? cnRub.fixedAmount
    : estimateCn({ taxableBase, taxParts });
  if (cnAmount > 0) {
    addLine('835', { deductions: cnAmount });
  }

  const igrRub = rubMap.get('840');
  const igrAmount = igrRub?.fixedAmount != null
    ? igrRub.fixedAmount
    : estimateIgr({
      taxableBase,
      taxParts,
      cn: cnAmount,
      is: isLine?.deductions || 0,
    });
  if (igrAmount > 0) {
    addLine('840', { base: taxableBase, deductions: igrAmount });
  }

  const transportRub = rubMap.get('204');
  const transportAmount = transport || transportRub?.fixedAmount || 0;
  if (transportAmount > 0) {
    addLine('204', { base: transportAmount, gains: transportAmount });
  }

  if (advances > 0) {
    addLine('453', { deductions: advances });
  }

  addLine('510', { deductions: extraDeductions > 0 ? extraDeductions : 0 });

  const cmuRub = rubMap.get('512');
  const cmuAmount = cmuRub?.fixedAmount || 0;
  if (cmuAmount > 0) {
    addLine('512', { deductions: cmuAmount });
  }

  return lines.sort((a, b) => a.sortOrder - b.sortOrder);
}

function computeBlockSubtotals(lines) {
  const blocks = { 1: { gains: 0, deductions: 0 }, 2: { gains: 0, deductions: 0 }, 3: { gains: 0, deductions: 0 } };
  lines.forEach((line) => {
    const b = blocks[line.block] || blocks[1];
    b.gains += line.gains || 0;
    b.deductions += line.deductions || 0;
  });
  return blocks;
}

function computePayslipTotals(lines) {
  const blocks = computeBlockSubtotals(lines);
  const totalGains = blocks[1].gains + blocks[3].gains;
  const totalDeductions = blocks[2].deductions + blocks[3].deductions;
  const netPay = Math.max(0, totalGains - totalDeductions);
  return { blocks, totalGains, totalDeductions, netPay };
}

function buildAnnualCumulsRows(currentLines, previousCumuls = {}) {
  const totals = computePayslipTotals(currentLines);
  const cnps = currentLines.find((l) => l.code === '810')?.deductions || 0;
  const is = currentLines.find((l) => l.code === '820')?.deductions || 0;
  const cn = currentLines.find((l) => l.code === '835')?.deductions || 0;
  const igr = currentLines.find((l) => l.code === '840')?.deductions || 0;
  const brut = (currentLines.find((l) => l.code === '100')?.gains || 0)
    + (currentLines.find((l) => l.code === '110')?.gains || 0)
    + (currentLines.find((l) => l.code === '210')?.gains || 0)
    + (currentLines.find((l) => l.code === '211')?.gains || 0);

  return {
    brutImposable: (previousCumuls.brutImposable || 0) + brut,
    cnps: (previousCumuls.cnps || 0) + cnps,
    is: (previousCumuls.is || 0) + is,
    cn: (previousCumuls.cn || 0) + cn,
    igr: (previousCumuls.igr || 0) + igr,
    totalGains: (previousCumuls.totalGains || 0) + totals.totalGains,
    totalDeductions: (previousCumuls.totalDeductions || 0) + totals.totalDeductions,
    netPay: (previousCumuls.netPay || 0) + totals.netPay,
  };
}

async function getPreviousAnnualCumuls({ staffProfileId, teacherId, schoolId, year, beforeMonth }) {
  const prior = await prisma.payslip.findMany({
    where: {
      schoolId,
      ...(staffProfileId ? { staffProfileId } : {}),
      ...(teacherId ? { teacherId } : {}),
      payrollRun: { year, month: { lt: beforeMonth } },
    },
    select: { annualCumuls: true },
  });
  return prior.reduce((acc, p) => {
    const c = p.annualCumuls || {};
    return {
      brutImposable: (acc.brutImposable || 0) + (c.brutImposable || 0),
      cnps: (acc.cnps || 0) + (c.cnps || 0),
      is: (acc.is || 0) + (c.is || 0),
      cn: (acc.cn || 0) + (c.cn || 0),
      igr: (acc.igr || 0) + (c.igr || 0),
      totalGains: (acc.totalGains || 0) + (c.totalGains || 0),
      totalDeductions: (acc.totalDeductions || 0) + (c.totalDeductions || 0),
      netPay: (acc.netPay || 0) + (c.netPay || 0),
    };
  }, {});
}

function resolveEmployeeIdentity(profile, teacher) {
  const user = teacher?.user;
  const lastName = profile?.lastName || user?.lastName || '';
  const firstName = profile?.firstName || user?.firstName || '';
  return {
    matricule: profile?.staffMatricule || teacher?.id?.slice(-8)?.toUpperCase() || '—',
    lastName: String(lastName).toUpperCase(),
    firstName: String(firstName).trim(),
    jobTitle: profile?.jobTitle || teacher?.subject || '—',
    birthDate: profile?.birthDate || user?.birthDate || null,
    cnpsNumber: profile?.cnpsNumber || '—',
    taxParts: profile?.taxParts ?? 1,
    nationality: profile?.nationality || 'IVOIRIENNE',
    maritalStatus: profile?.maritalStatus || '—',
    hireDate: profile?.hireDate || null,
  };
}

async function computePayslipPayload({
  profile,
  teacher,
  schoolId,
  month,
  year,
  advances = 0,
  bonuses = 0,
  extraDeductions = 0,
  paymentMethod = 'VIREMENT',
}) {
  const rubriques = await loadSchoolRubriques(schoolId);
  const lines = buildPayslipLines({
    profile,
    rubriques,
    advances,
    bonuses,
    extraDeductions,
  });
  const totals = computePayslipTotals(lines);
  const { start, end } = monthBounds(month, year);
  const previous = await getPreviousAnnualCumuls({
    staffProfileId: profile?.id,
    teacherId: teacher?.id,
    schoolId,
    year,
    beforeMonth: month,
  });
  const annualCumuls = buildAnnualCumulsRows(lines, previous);

  return {
    lines,
    totals,
    annualCumuls,
    periodStart: start,
    periodEnd: end,
    nextPayDate: nextMonthFirstDay(month, year),
    paymentMethod,
    employee: resolveEmployeeIdentity(profile, teacher),
    rubriques,
  };
}

async function savePayslipLines(payslipId, lines, tx = prisma) {
  await tx.payslipLine.deleteMany({ where: { payslipId } });
  if (!lines.length) return;
  await tx.payslipLine.createMany({
    data: lines.map((line) => ({
      payslipId,
      code: line.code,
      label: line.label,
      base: line.base,
      rate: line.rate,
      rateLabel: line.rateLabel || null,
      gains: line.gains || 0,
      deductions: line.deductions || 0,
      block: line.block,
      category: line.category,
      sortOrder: line.sortOrder,
    })),
  });
}

function formatDateFr(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR');
}

async function buildOfficialPayslip({
  payslipId,
  school,
  profile,
  teacher,
  payrollRun,
  advances = 0,
  bonuses = 0,
  extraDeductions = 0,
  paymentMethod,
  outputDir,
}) {
  const payload = await computePayslipPayload({
    profile,
    teacher,
    schoolId: school.id,
    month: payrollRun.month,
    year: payrollRun.year,
    advances,
    bonuses,
    extraDeductions,
    paymentMethod,
  });

  await prisma.$transaction(async (tx) => {
    await tx.payslip.update({
      where: { id: payslipId },
      data: {
        baseSalary: profile?.baseSalary || 0,
        bonuses,
        deductions: payload.totals.totalDeductions,
        advances,
        netPay: payload.totals.netPay,
        totalGains: payload.totals.totalGains,
        totalDeductions: payload.totals.totalDeductions,
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        nextPayDate: payload.nextPayDate,
        paymentMethod: paymentMethod || 'VIREMENT',
        annualCumuls: payload.annualCumuls,
      },
    });
    await savePayslipLines(payslipId, payload.lines, tx);
  });

  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: { lines: { orderBy: { sortOrder: 'asc' } }, payrollRun: true },
  });

  const pdf = await require('./paySlipPdf').generatePaySlipPdf({
    payslip,
    school,
    profile,
    teacher,
    payload,
    outputDir,
  });

  if (pdf.pdfUrl) {
    await prisma.payslip.update({
      where: { id: payslipId },
      data: { pdfUrl: pdf.pdfUrl },
    });
  }

  return { ok: true, payslip, pdfUrl: pdf.pdfUrl, netPay: payload.totals.netPay, payload };
}

async function getPayslipViewModel(payslipId, schoolId) {
  const payslip = await prisma.payslip.findFirst({
    where: { id: payslipId, schoolId },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      payrollRun: true,
      staffProfile: true,
      teacher: { include: { user: true, staffProfile: true } },
      school: true,
    },
  });
  if (!payslip) return null;

  const profile = payslip.staffProfile || payslip.teacher?.staffProfile || payslip.staffProfile;
  const teacher = payslip.teacher;
  const employee = resolveEmployeeIdentity(profile || payslip.staffProfile, teacher);
  const totals = computePayslipTotals(payslip.lines || []);
  const blocks = totals.blocks;
  const { buildDisplayLines } = require('../utils/paySlipLayout');

  return {
    payslip,
    school: payslip.school,
    employee,
    lines: payslip.lines,
    displayLines: buildDisplayLines(payslip.lines || []),
    totals,
    blocks,
    annualCumuls: payslip.annualCumuls || {},
    periodLabel: `${formatDateFr(payslip.periodStart)} au ${formatDateFr(payslip.periodEnd)}`,
  };
}

async function saveSchoolRubriqueOverrides(schoolId, rows = []) {
  for (const row of rows) {
    const code = String(row.code || '').trim();
    if (!code) continue;
    const data = {
      label: row.label || null,
      rate: row.rate != null && row.rate !== '' ? parseFloat(row.rate) : null,
      fixedAmount: row.fixedAmount != null && row.fixedAmount !== '' ? parseInt(row.fixedAmount, 10) : null,
      enabled: row.enabled !== false && row.enabled !== 'false',
    };
    await prisma.schoolPayRubrique.upsert({
      where: { schoolId_code: { schoolId, code } },
      create: { schoolId, code, ...data },
      update: data,
    });
  }
}

module.exports = {
  loadSchoolRubriques,
  buildPayslipLines,
  computePayslipTotals,
  computeBlockSubtotals,
  buildAnnualCumulsRows,
  computePayslipPayload,
  buildOfficialPayslip,
  getPayslipViewModel,
  saveSchoolRubriqueOverrides,
  formatDateFr,
  monthBounds,
};
