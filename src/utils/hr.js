const prisma = require('../config/database');

async function ensureStaffProfile(teacherId, schoolId) {
  const existing = await prisma.staffProfile.findUnique({ where: { teacherId } });
  if (existing) return existing;
  return prisma.staffProfile.create({
    data: { teacherId, schoolId },
  });
}

async function getTeacherWithProfile(teacherId, schoolId) {
  return prisma.teacher.findFirst({
    where: { id: teacherId, schoolId },
    include: {
      user: true,
      staffProfile: true,
      staffDocuments: { orderBy: { createdAt: 'desc' } },
      classes: { include: { class: true } },
    },
  });
}

async function notifyUser(userId, title, body) {
  await prisma.notification.create({
    data: { userId, type: 'GENERAL', title, body },
  });
}

function calcNetPay({ baseSalary, bonuses = 0, deductions = 0, advances = 0, hourlyRate, hoursWorked }) {
  let base = baseSalary || 0;
  if (hourlyRate && hoursWorked) {
    base = Math.round(hourlyRate * hoursWorked);
  }
  return Math.max(0, base + bonuses - deductions - advances);
}

function monthLabel(month, year) {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function todayDateOnly() {
  const d = new Date();
  return new Date(d.toISOString().slice(0, 10));
}

function validateLeaveRequest({ startDate, endDate }) {
  if (!startDate || !endDate) return { ok: false, error: 'dates' };
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: 'dates' };
  }
  if (end < start) return { ok: false, error: 'range' };
  return { ok: true };
}

module.exports = {
  ensureStaffProfile,
  getTeacherWithProfile,
  notifyUser,
  calcNetPay,
  monthLabel,
  todayDateOnly,
  validateLeaveRequest,
};
