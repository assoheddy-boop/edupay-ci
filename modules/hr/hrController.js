const prisma = require('../../src/config/database');
const { recordLeave, generatePayroll, evaluateTeacher } = require('../../services/HRService');
const { todayDateOnly } = require('../../src/utils/hr');

function resolveTeacherId(req) {
  if (req.user?.role === 'TEACHER') return req.user.teacher?.id || null;
  return req.body.teacherId || req.query.teacherId || null;
}

function resolveSchoolId(req) {
  if (req.user?.school?.id) return req.user.school.id;
  if (req.user?.teacher?.schoolId) return req.user.teacher.schoolId;
  return null;
}

async function assertTeacherInSchool(teacherId, schoolId) {
  if (!teacherId || !schoolId) return null;
  return prisma.teacher.findFirst({
    where: { id: teacherId, schoolId },
    include: { user: true, teacherProfile: true, staffProfile: true },
  });
}

async function listTeachers(schoolId) {
  return prisma.teacher.findMany({
    where: { schoolId },
    include: { user: true, teacherProfile: true },
    orderBy: { user: { lastName: 'asc' } },
  });
}

function layoutLocals(req, extra) {
  return {
    user: req.user,
    success: req.query.success || null,
    error: req.query.error || null,
    ...extra,
  };
}

async function profilePage(req, res) {
  const schoolId = resolveSchoolId(req);
  const teacherId = req.user.role === 'TEACHER' ? req.user.teacher.id : req.query.teacherId;
  const teachers = req.user.role === 'SCHOOL_ADMIN' ? await listTeachers(schoolId) : [];
  const teacher = teacherId ? await assertTeacherInSchool(teacherId, schoolId) : teachers[0] || null;
  const profile = teacher?.teacherProfile || null;
  res.render('hr/profile', layoutLocals(req, { teachers, teacher, profile }));
}

async function saveProfile(req, res) {
  const schoolId = resolveSchoolId(req);
  const teacherId = resolveTeacherId(req);
  const { name, subject, hireDate } = req.body;
  const teacher = await assertTeacherInSchool(teacherId, schoolId);
  if (!teacher) return res.redirect('/hr/profile?error=teacher');

  const displayName = name || `${teacher.user.firstName} ${teacher.user.lastName}`.trim();
  await prisma.teacherProfile.upsert({
    where: { teacherId },
    create: {
      teacherId,
      name: displayName,
      subject: subject || teacher.subject || null,
      hireDate: hireDate ? new Date(hireDate) : null,
    },
    update: {
      name: displayName,
      subject: subject || null,
      hireDate: hireDate ? new Date(hireDate) : null,
    },
  });

  await prisma.teacher.update({
    where: { id: teacherId },
    data: { subject: subject || teacher.subject },
  });

  if (hireDate) {
    await prisma.staffProfile.upsert({
      where: { teacherId },
      create: { teacherId, schoolId, hireDate: new Date(hireDate) },
      update: { hireDate: new Date(hireDate) },
    });
  }

  res.redirect(`/hr/profile?teacherId=${teacherId}&success=1`);
}

async function leavePage(req, res) {
  const schoolId = resolveSchoolId(req);
  const teacherId = req.user.role === 'TEACHER' ? req.user.teacher.id : req.query.teacherId;
  const teachers = req.user.role === 'SCHOOL_ADMIN' ? await listTeachers(schoolId) : [];
  const where = req.user.role === 'TEACHER'
    ? { teacherId: req.user.teacher.id }
    : { teacher: { schoolId } };
  const leaves = await prisma.leave.findMany({
    where,
    include: { teacher: { include: { user: true } } },
    orderBy: { startDate: 'desc' },
  });
  res.render('hr/leave', layoutLocals(req, { teachers, teacherId, leaves, attendances: [] }));
}

async function createLeave(req, res) {
  const schoolId = resolveSchoolId(req);
  const teacherId = resolveTeacherId(req);
  const { startDate, endDate, status } = req.body;
  const teacher = await assertTeacherInSchool(teacherId, schoolId);
  if (!teacher) return res.redirect('/hr/leave?error=teacher');

  const recorded = await recordLeave(teacherId, { startDate, endDate });
  if (!recorded.ok) return res.redirect(`/hr/leave?error=${recorded.error}`);

  await prisma.leave.create({
    data: {
      teacherId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: status || 'PENDING',
    },
  });

  res.redirect('/hr/leave?success=1');
}

async function presencePage(req, res) {
  const schoolId = resolveSchoolId(req);
  const teachers = req.user.role === 'SCHOOL_ADMIN' ? await listTeachers(schoolId) : [];
  const where = req.user.role === 'TEACHER'
    ? { teacherId: req.user.teacher.id }
    : { schoolId };
  const attendances = await prisma.staffAttendance.findMany({
    where,
    include: { teacher: { include: { user: true } } },
    orderBy: { date: 'desc' },
    take: 60,
  });
  const leaves = await prisma.leave.findMany({
    where: req.user.role === 'TEACHER' ? { teacherId: req.user.teacher.id } : { teacher: { schoolId } },
    include: { teacher: { include: { user: true } } },
    orderBy: { startDate: 'desc' },
    take: 20,
  });
  res.render('hr/leave', layoutLocals(req, {
    teachers,
    teacherId: req.user.teacher?.id || null,
    leaves,
    attendances,
    today: todayDateOnly(),
    presenceMode: true,
  }));
}

async function payrollPage(req, res) {
  const schoolId = resolveSchoolId(req);
  const teachers = req.user.role === 'SCHOOL_ADMIN' ? await listTeachers(schoolId) : [];
  const where = req.user.role === 'TEACHER'
    ? { teacherId: req.user.teacher.id }
    : { teacher: { schoolId } };
  const payrolls = await prisma.payroll.findMany({
    where,
    include: { teacher: { include: { user: true } } },
    orderBy: { month: 'desc' },
  });
  res.render('hr/payroll', layoutLocals(req, { teachers, payrolls }));
}

async function createPayroll(req, res) {
  const schoolId = resolveSchoolId(req);
  const teacherId = resolveTeacherId(req);
  const { month } = req.body;
  const teacher = await assertTeacherInSchool(teacherId, schoolId);
  if (!teacher) return res.redirect('/hr/payroll?error=teacher');

  const result = await generatePayroll(teacherId, month);
  if (!result.ok) return res.redirect(`/hr/payroll?error=${result.error}`);

  await prisma.payroll.create({
    data: {
      teacherId,
      month: String(month),
      amount: result.netPay,
      pdfPath: result.pdfUrl || null,
    },
  });

  res.redirect('/hr/payroll?success=1');
}

async function evaluationPage(req, res) {
  const schoolId = resolveSchoolId(req);
  const teachers = req.user.role === 'SCHOOL_ADMIN' ? await listTeachers(schoolId) : [];
  const where = req.user.role === 'TEACHER'
    ? { teacherId: req.user.teacher.id }
    : { teacher: { schoolId } };
  const evaluations = await prisma.evaluation.findMany({
    where,
    include: { teacher: { include: { user: true } } },
    orderBy: { id: 'desc' },
  });
  res.render('hr/evaluation', layoutLocals(req, { teachers, evaluations }));
}

async function createEvaluation(req, res) {
  const schoolId = resolveSchoolId(req);
  const teacherId = resolveTeacherId(req);
  const { score, comments } = req.body;
  const teacher = await assertTeacherInSchool(teacherId, schoolId);
  if (!teacher) return res.redirect('/hr/evaluation?error=teacher');

  const result = await evaluateTeacher(teacherId, score, comments);
  if (!result.ok) return res.redirect(`/hr/evaluation?error=${result.error}`);

  res.redirect('/hr/evaluation?success=1');
}

module.exports = {
  profilePage,
  saveProfile,
  leavePage,
  createLeave,
  presencePage,
  payrollPage,
  createPayroll,
  evaluationPage,
  createEvaluation,
};
