const prisma = require('../src/config/database');
const { hashPassword } = require('../src/utils/password');
const { ensureStaffProfile, calcNetPay, validateLeaveRequest } = require('../src/utils/hr');
const { generatePayrollPDF } = require('./export');
const logger = require('./logger');

function parseMonth(month) {
  if (month && typeof month === 'object') {
    const m = parseInt(month.month, 10);
    const y = parseInt(month.year, 10);
    if (m >= 1 && m <= 12 && y > 2000) return { month: m, year: y };
  }

  if (typeof month === 'string' && month.includes('-')) {
    const [yearPart, monthPart] = month.split('-');
    const y = parseInt(yearPart, 10);
    const m = parseInt(monthPart, 10);
    if (m >= 1 && m <= 12 && y > 2000) return { month: m, year: y };
  }

  const m = parseInt(month, 10);
  const now = new Date();
  if (m >= 1 && m <= 12) return { month: m, year: now.getFullYear() };

  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

async function getApprovedAdvancesTotal(teacherId) {
  const advances = await prisma.salaryAdvance.findMany({
    where: { teacherId, status: 'APPROVED' },
  });
  return advances.reduce((sum, item) => sum + item.amount, 0);
}

/**
 * Insère un enseignant (User + Teacher + StaffProfile) dans Prisma.
 */
async function createTeacherProfile(data) {
  const {
    email,
    firstName,
    lastName,
    phone,
    subject,
    password,
    schoolId,
  } = data || {};

  if (!email || !firstName || !lastName || !schoolId) {
    logger.warn('Création enseignant : données incomplètes', { email, schoolId });
    return { ok: false, error: 'data' };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    logger.warn('Création enseignant : email déjà utilisé', { email });
    return { ok: false, error: 'email' };
  }

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) {
    logger.warn('Création enseignant : école introuvable', { schoolId });
    return { ok: false, error: 'school' };
  }

  const tempPassword = password || `Edu${Math.random().toString(36).slice(2, 10)}`;
  const hashed = await hashPassword(tempPassword);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      firstName,
      lastName,
      phone: phone || null,
      role: 'TEACHER',
      teacher: { create: { schoolId, subject: subject || null } },
    },
    include: { teacher: true },
  });

  await ensureStaffProfile(user.teacher.id, schoolId);

  logger.info('Enseignant créé', { teacherId: user.teacher.id, email, schoolId });
  return { ok: true, user, teacher: user.teacher, tempPassword };
}

/**
 * Ajoute une demande de congé pour un enseignant.
 * @param {string} teacherId
 * @param {{ startDate: string|Date, endDate: string|Date, type?: string, reason?: string }} dates
 */
async function recordLeave(teacherId, dates = {}) {
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher) {
    logger.warn('Congé : enseignant introuvable', { teacherId });
    return { ok: false, error: 'teacher' };
  }

  const validation = validateLeaveRequest({
    startDate: dates.startDate,
    endDate: dates.endDate,
  });
  if (!validation.ok) {
    logger.warn('Congé : dates invalides', { teacherId, error: validation.error });
    return validation;
  }

  const leave = await prisma.leaveRequest.create({
    data: {
      teacherId,
      schoolId: teacher.schoolId,
      type: dates.type || 'ANNUAL',
      startDate: new Date(dates.startDate),
      endDate: new Date(dates.endDate),
      reason: dates.reason || null,
    },
  });

  logger.info('Demande de congé enregistrée', { teacherId, leaveId: leave.id, type: leave.type });
  return { ok: true, leave };
}

/**
 * Calcule le salaire d'un enseignant pour un mois et génère le PDF.
 * @param {string} teacherId
 * @param {string|number|{month:number,year:number}} month  ex. "2026-08", 8, { month: 8, year: 2026 }
 */
async function generatePayroll(teacherId, month) {
  const { month: m, year: y } = parseMonth(month);

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: { user: true, staffProfile: true, school: true },
  });
  if (!teacher) {
    logger.warn('Paie : enseignant introuvable', { teacherId });
    return { ok: false, error: 'teacher' };
  }

  const schoolId = teacher.schoolId;
  if (!teacher.staffProfile) {
    await ensureStaffProfile(teacherId, schoolId);
  }

  const profile = await prisma.staffProfile.findUnique({ where: { teacherId } });

  let payrollRun = await prisma.payrollRun.findUnique({
    where: { schoolId_month_year: { schoolId, month: m, year: y } },
  });

  if (payrollRun?.status === 'PAID') {
    logger.warn('Paie déjà versée', { teacherId, month: m, year: y, payrollRunId: payrollRun.id });
    return { ok: false, error: 'already_paid' };
  }

  if (!payrollRun) {
    payrollRun = await prisma.payrollRun.create({
      data: { schoolId, month: m, year: y, status: 'DRAFT' },
    });
  }

  const advanceTotal = await getApprovedAdvancesTotal(teacherId);
  const netPay = calcNetPay({
    baseSalary: profile?.baseSalary || 0,
    hourlyRate: profile?.hourlyRate,
    hoursWorked: profile?.contractType === 'VACATAIRE' ? 0 : undefined,
    advances: advanceTotal,
  });

  const payslip = await prisma.payslip.upsert({
    where: { payrollRunId_teacherId: { payrollRunId: payrollRun.id, teacherId } },
    create: {
      payrollRunId: payrollRun.id,
      teacherId,
      schoolId,
      baseSalary: profile?.baseSalary || 0,
      advances: advanceTotal,
      netPay,
    },
    update: {
      baseSalary: profile?.baseSalary || 0,
      advances: advanceTotal,
      netPay,
    },
  });

  const pdf = await generatePayrollPDF(teacherId, { month: m, year: y });
  const pdfUrl = pdf.ok ? pdf.pdfUrl : payslip.pdfUrl || null;

  if (!pdf.ok) {
    logger.error('Échec génération PDF de paie', { teacherId, month: m, year: y, error: pdf.error });
  } else {
    logger.info('Fiche de paie générée', { teacherId, month: m, year: y, netPay, pdfUrl });
  }

  const updatedPayslip = await prisma.payslip.update({
    where: { id: payslip.id },
    data: pdfUrl ? { pdfUrl } : {},
  });

  const totals = await prisma.payslip.aggregate({
    where: { payrollRunId: payrollRun.id },
    _sum: { netPay: true },
  });

  await prisma.payrollRun.update({
    where: { id: payrollRun.id },
    data: { totalNet: totals._sum.netPay || 0, status: 'VALIDATED' },
  });

  return { ok: true, payslip: updatedPayslip, pdfUrl, netPay, payrollRunId: payrollRun.id };
}

async function evaluateTeacher(teacherId, score, comments) {
  if (!teacherId) {
    logger.warn('Évaluation : enseignant manquant');
    return { ok: false, error: 'teacher' };
  }

  const value = parseInt(score, 10);
  if (Number.isNaN(value) || value < 0 || value > 20) {
    logger.warn('Évaluation : score invalide', { teacherId, score });
    return { ok: false, error: 'score' };
  }

  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher) {
    logger.warn('Évaluation : enseignant introuvable', { teacherId });
    return { ok: false, error: 'teacher' };
  }

  const evaluation = await prisma.evaluation.create({
    data: {
      teacherId,
      score: value,
      comments: comments || null,
    },
  });

  logger.info('Évaluation enseignant enregistrée', { teacherId, score: value });
  return { ok: true, evaluation };
}

module.exports = {
  createTeacherProfile,
  recordLeave,
  generatePayroll,
  evaluateTeacher,
  parseMonth,
};
