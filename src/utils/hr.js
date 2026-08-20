const prisma = require('../config/database');

async function ensureStaffProfile(teacherId, schoolId) {
  const existing = await prisma.staffProfile.findUnique({ where: { teacherId } });
  if (existing) return existing;
  const teacher = await prisma.teacher.findFirst({
    where: { id: teacherId, schoolId },
    include: { user: true },
  });
  return prisma.staffProfile.create({
    data: {
      teacherId,
      schoolId,
      jobTitle: 'TEACHER',
      firstName: teacher?.user?.firstName || null,
      lastName: teacher?.user?.lastName || null,
      email: teacher?.user?.email || null,
      phone: teacher?.user?.phone || null,
    },
  });
}

async function resolveStaffProfileId({ teacherId, staffProfileId, schoolId }) {
  if (staffProfileId) {
    const profile = await prisma.staffProfile.findFirst({ where: { id: staffProfileId, schoolId } });
    return profile?.id || null;
  }
  if (teacherId) {
    const profile = await prisma.staffProfile.findUnique({ where: { teacherId } });
    if (profile) return profile.id;
    return (await ensureStaffProfile(teacherId, schoolId)).id;
  }
  return null;
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

async function getStaffProfileDetail(profileId, schoolId) {
  return prisma.staffProfile.findFirst({
    where: { id: profileId, schoolId },
    include: {
      teacher: { include: { user: true, classes: { include: { class: true } } } },
      documents: { orderBy: { createdAt: 'desc' } },
    },
  });
}

function staffDisplayName(profile) {
  if (!profile) return '—';
  if (profile.teacher?.user) {
    return `${profile.teacher.user.firstName} ${profile.teacher.user.lastName}`.trim();
  }
  return `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || '—';
}

function countLeaveDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(ms / 86400000) + 1);
}

async function getLeaveBalance(staffProfileId) {
  const profile = await prisma.staffProfile.findUnique({ where: { id: staffProfileId } });
  if (!profile) return null;

  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const approved = await prisma.leaveRequest.findMany({
    where: {
      OR: [{ staffProfileId }, { teacherId: profile.teacherId || undefined }],
      status: 'APPROVED',
      type: 'ANNUAL',
      startDate: { gte: yearStart },
    },
  });

  const used = approved.reduce((sum, leave) => sum + countLeaveDays(leave.startDate, leave.endDate), 0);
  const entitled = profile.annualLeaveDays || 30;
  return { entitled, used, remaining: Math.max(0, entitled - used) };
}

async function notifyUser(userId, title, body) {
  if (!userId) return;
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
  resolveStaffProfileId,
  getTeacherWithProfile,
  getStaffProfileDetail,
  staffDisplayName,
  countLeaveDays,
  getLeaveBalance,
  notifyUser,
  calcNetPay,
  monthLabel,
  todayDateOnly,
  validateLeaveRequest,
};
