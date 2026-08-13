const prisma = require('../config/database');
const { ensureStaffProfile, notifyUser, todayDateOnly } = require('../utils/hr');
const { recordLeave } = require('../../services/HRService');

async function dashboard(req, res) {
  const teacher = req.user.teacher;
  if (!teacher) return res.redirect('/auth/login');

  const schoolId = teacher.schoolId;
  const today = todayDateOnly();

  const [profile, todayAttendance, pendingLeave, lastPayslip, lastEvaluation] = await Promise.all([
    prisma.staffProfile.findUnique({ where: { teacherId: teacher.id } }),
    prisma.staffAttendance.findUnique({ where: { teacherId_date: { teacherId: teacher.id, date: today } } }),
    prisma.leaveRequest.findFirst({ where: { teacherId: teacher.id, status: 'PENDING' }, orderBy: { createdAt: 'desc' } }),
    prisma.payslip.findFirst({ where: { teacherId: teacher.id }, orderBy: { createdAt: 'desc' }, include: { payrollRun: true } }),
    prisma.staffEvaluation.findFirst({ where: { teacherId: teacher.id }, orderBy: { createdAt: 'desc' } }),
  ]);

  res.render('teacher/hr/dashboard', {
    user: req.user,
    teacher,
    profile,
    todayAttendance,
    pendingLeave,
    lastPayslip,
    lastEvaluation,
    success: req.query.success || null,
  });
}

async function profile(req, res) {
  const teacher = req.user.teacher;
  const data = await prisma.teacher.findUnique({
    where: { id: teacher.id },
    include: {
      user: true,
      staffProfile: true,
      staffDocuments: { orderBy: { createdAt: 'desc' } },
      classes: { include: { class: true } },
    },
  });
  res.render('teacher/hr/profile', { user: req.user, teacher: data, success: req.query.success || null });
}

async function leavesPage(req, res) {
  const teacher = req.user.teacher;
  const leaves = await prisma.leaveRequest.findMany({
    where: { teacherId: teacher.id },
    orderBy: { createdAt: 'desc' },
  });
  res.render('teacher/hr/leaves', {
    user: req.user,
    teacher,
    leaves,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function requestLeave(req, res) {
  const teacher = req.user.teacher;
  const { type, startDate, endDate, reason } = req.body;

  const result = await recordLeave(teacher.id, { type, startDate, endDate, reason });
  if (!result.ok) {
    return res.redirect(`/teacher/hr/leaves?error=${result.error}`);
  }

  const school = await prisma.school.findUnique({
    where: { id: teacher.schoolId },
    include: { admin: true },
  });
  if (school?.admin) {
    await notifyUser(
      school.admin.id,
      'Demande de congé',
      `${req.user.firstName} ${req.user.lastName} a soumis une demande de congé.`,
    );
  }

  res.redirect('/teacher/hr/leaves?success=requested');
}

async function payslipsPage(req, res) {
  const teacher = req.user.teacher;
  const payslips = await prisma.payslip.findMany({
    where: { teacherId: teacher.id },
    include: { payrollRun: true },
    orderBy: { createdAt: 'desc' },
  });
  res.render('teacher/hr/payslips', { user: req.user, teacher, payslips });
}

async function attendancePage(req, res) {
  const teacher = req.user.teacher;
  const today = todayDateOnly();
  const [todayRecord, history] = await Promise.all([
    prisma.staffAttendance.findUnique({ where: { teacherId_date: { teacherId: teacher.id, date: today } } }),
    prisma.staffAttendance.findMany({
      where: { teacherId: teacher.id },
      orderBy: { date: 'desc' },
      take: 14,
    }),
  ]);
  res.render('teacher/hr/attendance', {
    user: req.user,
    teacher,
    todayRecord,
    history,
    success: req.query.success || null,
  });
}

async function clockIn(req, res) {
  const teacher = req.user.teacher;
  const today = todayDateOnly();
  const now = new Date();
  const lateThreshold = new Date();
  lateThreshold.setHours(8, 15, 0, 0);
  const status = now > lateThreshold ? 'LATE' : 'PRESENT';

  await prisma.staffAttendance.upsert({
    where: { teacherId_date: { teacherId: teacher.id, date: today } },
    create: {
      teacherId: teacher.id,
      schoolId: teacher.schoolId,
      date: today,
      checkIn: now,
      status,
    },
    update: { checkIn: now, status },
  });

  res.redirect('/teacher/hr/attendance?success=checkin');
}

async function clockOut(req, res) {
  const teacher = req.user.teacher;
  const today = todayDateOnly();
  const now = new Date();

  await prisma.staffAttendance.upsert({
    where: { teacherId_date: { teacherId: teacher.id, date: today } },
    create: {
      teacherId: teacher.id,
      schoolId: teacher.schoolId,
      date: today,
      checkOut: now,
      status: 'PRESENT',
    },
    update: { checkOut: now },
  });

  res.redirect('/teacher/hr/attendance?success=checkout');
}

async function requestAdvance(req, res) {
  const teacher = req.user.teacher;
  const { amount, reason } = req.body;
  const amt = parseInt(amount, 10);
  if (!amt || amt <= 0) return res.redirect('/teacher/hr/payslips?error=amount');

  await prisma.salaryAdvance.create({
    data: {
      teacherId: teacher.id,
      schoolId: teacher.schoolId,
      amount: amt,
      reason: reason || null,
    },
  });

  const school = await prisma.school.findUnique({
    where: { id: teacher.schoolId },
    include: { admin: true },
  });
  if (school?.admin) {
    await notifyUser(
      school.admin.id,
      'Demande d\'avance',
      `${req.user.firstName} ${req.user.lastName} demande une avance de ${amt.toLocaleString('fr-FR')} FCFA.`,
    );
  }

  res.redirect('/teacher/hr/payslips?success=advance');
}

async function evaluationsPage(req, res) {
  const teacher = req.user.teacher;
  const evaluations = await prisma.staffEvaluation.findMany({
    where: { teacherId: teacher.id },
    orderBy: { createdAt: 'desc' },
  });
  res.render('teacher/hr/evaluations', { user: req.user, teacher, evaluations });
}

module.exports = {
  dashboard,
  profile,
  leavesPage,
  requestLeave,
  payslipsPage,
  attendancePage,
  clockIn,
  clockOut,
  requestAdvance,
  evaluationsPage,
};
