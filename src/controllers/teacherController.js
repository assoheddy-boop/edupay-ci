const prisma = require('../config/database');
const { sendNotification } = require('../../services/NotificationService');
const {
  applyAttendance,
  applyGrade,
  applyHomework,
  attendanceTypeFromStatus,
  statusesFromBody,
} = require('../services/offlineActions');
const { calendarEventsJson } = require('../services/homeworkService');
const { ENTRY_TERMS } = require('../services/academicTerms');
const { loadSchoolCoefficients, COLLEGE_CI_SUBJECTS, GRADE_KINDS } = require('../services/gradesAverage');
const { listSubjectsForSchool } = require('../../services/TimetableService');

function collegeCoeffDefaults() {
  const map = {};
  COLLEGE_CI_SUBJECTS.forEach((s) => { map[s.name] = s.coefficient; });
  return map;
}

async function dashboard(req, res) {
  const teacher = req.user.teacher;
  if (!teacher) return res.redirect('/auth/login');

  const classes = await prisma.teacherClass.findMany({
    where: { teacherId: teacher.id },
    include: { class: { include: { _count: { select: { students: true } } } } },
  });

  const recentGrades = await prisma.grade.findMany({
    where: { teacherId: teacher.id },
    include: { student: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  res.render('teacher/dashboard', { user: req.user, teacher, classes, recentGrades });
}

async function students(req, res) {
  const teacher = req.user.teacher;
  const classLinks = await prisma.teacherClass.findMany({
    where: { teacherId: teacher.id },
    include: {
      class: {
        include: { students: { orderBy: { lastName: 'asc' } } },
      },
    },
  });

  res.render('teacher/students', { user: req.user, teacher, classLinks });
}

async function grades(req, res) {
  const teacher = req.user.teacher;
  const [classLinks, subjects] = await Promise.all([
    prisma.teacherClass.findMany({
      where: { teacherId: teacher.id },
      include: { class: { include: { students: true } } },
    }),
    listSubjectsForSchool(teacher.schoolId),
  ]);
  const coeffMap = await loadSchoolCoefficients(teacher.schoolId);

  res.render('teacher/grades', {
    user: req.user,
    teacher,
    classLinks,
    subjects,
    coeffMap,
    terms: ENTRY_TERMS,
    gradeKinds: GRADE_KINDS,
    collegeDefaults: collegeCoeffDefaults(),
    error: null,
    success: null,
  });
}

async function createGrade(req, res) {
  try {
    const result = await applyGrade({ user: req.user, payload: req.body });
    if (!result.ok) return res.redirect('/teacher/grades?error=1');
    res.redirect('/teacher/grades?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/teacher/grades?error=1');
  }
}

async function absences(req, res) {
  const teacher = req.user.teacher;
  const classLinks = await prisma.teacherClass.findMany({
    where: { teacherId: teacher.id },
    include: { class: { include: { students: true } } },
  });

  res.render('teacher/absences', { user: req.user, teacher, classLinks, error: null });
}

async function createAbsence(req, res) {
  const { studentId, date, type, reason } = req.body;
  try {
    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        class: { teachers: { some: { teacherId: req.user.teacher.id } } },
      },
      include: { parents: { include: { parent: true } } },
    });
    if (!student) return res.redirect('/teacher/absences?error=1');

    await prisma.absence.create({
      data: {
        studentId,
        date: new Date(date),
        type: type || 'ABSENCE',
        reason,
        recordedBy: req.user.teacher.id,
      },
    });

    for (const link of student.parents || []) {
      await sendNotification(
        link.parent.userId,
        type === 'LATE' ? 'late_reported' : 'absence_reported',
        `${student.firstName} ${student.lastName} — ${type === 'LATE' ? 'retard' : 'absence'} : ${reason || 'Sans motif'}.`,
        { schoolId: student.schoolId || req.user.teacher?.schoolId },
      );
    }

    res.redirect('/teacher/absences?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/teacher/absences?error=1');
  }
}

async function homeworks(req, res) {
  const teacher = req.user.teacher;
  const classLinks = await prisma.teacherClass.findMany({
    where: { teacherId: teacher.id },
    include: { class: true },
  });

  const homeworkList = await prisma.homework.findMany({
    where: { teacherId: teacher.id },
    include: { class: true, _count: { select: { submissions: true } } },
    orderBy: { dueDate: 'desc' },
  });

  res.render('teacher/homeworks', {
    user: req.user,
    teacher,
    classLinks,
    homeworkList,
    calendarEventsJson: calendarEventsJson(homeworkList),
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function homeworkEvents(req, res) {
  const teacher = req.user.teacher;
  if (!teacher) return res.status(403).json({ ok: false, error: 'forbidden' });
  const homeworkList = await prisma.homework.findMany({
    where: { teacherId: teacher.id },
    include: { class: true },
    orderBy: { dueDate: 'asc' },
  });
  res.json({ ok: true, events: JSON.parse(calendarEventsJson(homeworkList)) });
}

async function createHomework(req, res) {
  try {
    const result = await applyHomework({
      user: req.user,
      payload: {
        ...req.body,
        attachmentUrl: req.file ? (req.file.url || `/uploads/homeworks/${req.file.filename}`) : null,
      },
      file: req.file,
    });
    if (!result.ok) {
      const code = result.error === 'class' ? 'class' : '1';
      return res.redirect(`/teacher/homeworks?error=${code}`);
    }
    res.redirect('/teacher/homeworks?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/teacher/homeworks?error=1');
  }
}

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

async function schedulePage(req, res) {
  const teacher = req.user.teacher;
  const classLinks = await prisma.teacherClass.findMany({
    where: { teacherId: teacher.id },
    include: { class: true },
  });
  const schedules = await prisma.schedule.findMany({
    where: { teacherId: teacher.id },
    include: { class: true },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });

  res.render('teacher/schedule', {
    user: req.user,
    teacher,
    classLinks,
    schedules,
    days: DAYS,
    success: req.query.success || null,
  });
}

async function createSchedule(req, res) {
  const { classId, dayOfWeek, startTime, endTime, subject, room } = req.body;
  try {
    const owned = await prisma.teacherClass.findFirst({
      where: { teacherId: req.user.teacher.id, classId },
    });
    if (!owned) return res.redirect('/teacher/schedule?error=1');

    await prisma.schedule.create({
      data: {
        teacherId: req.user.teacher.id,
        classId,
        dayOfWeek: parseInt(dayOfWeek, 10),
        startTime,
        endTime,
        subject,
        room,
      },
    });
    res.redirect('/teacher/schedule?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/teacher/schedule?error=1');
  }
}

async function attendancePage(req, res) {
  const classLinks = await prisma.teacherClass.findMany({
    where: { teacherId: req.user.teacher.id },
    include: { class: { include: { students: { orderBy: { lastName: 'asc' } } } } },
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const studentIds = classLinks.flatMap((cl) => cl.class.students.map((s) => s.id));
  const marks = studentIds.length
    ? await prisma.absence.findMany({
      where: { studentId: { in: studentIds }, date: today },
    })
    : [];
  const statusByStudent = Object.fromEntries(
    marks.map((a) => [a.studentId, a.type === 'LATE' ? 'late' : 'absent']),
  );
  const justifiedByStudent = Object.fromEntries(
    marks.filter((a) => a.justified).map((a) => [a.studentId, true]),
  );
  const pendingJustifByStudent = Object.fromEntries(
    marks.filter((a) => a.justificationStatus === 'PENDING').map((a) => [a.studentId, true]),
  );
  res.render('teacher/attendance', {
    user: req.user,
    classLinks,
    statusByStudent,
    justifiedByStudent,
    pendingJustifByStudent,
    today: today.toISOString().slice(0, 10),
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function submitAttendance(req, res) {
  try {
    const result = await applyAttendance({
      user: req.user,
      payload: {
        classId: req.body.classId,
        date: req.body.date,
        statuses: statusesFromBody(req.body),
      },
    });
    if (!result.ok) return res.redirect('/teacher/attendance?error=1');
    res.redirect('/teacher/attendance?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/teacher/attendance?error=1');
  }
}

async function bulkGradesPage(req, res) {
  const teacher = req.user.teacher;
  const [classLinks, subjects] = await Promise.all([
    prisma.teacherClass.findMany({
      where: { teacherId: teacher.id },
      include: { class: { include: { students: { orderBy: { lastName: 'asc' } } } } },
    }),
    listSubjectsForSchool(teacher.schoolId),
  ]);
  const coeffMap = await loadSchoolCoefficients(teacher.schoolId);
  res.render('teacher/bulk-grades', {
    user: req.user,
    classLinks,
    subjects,
    coeffMap,
    terms: ENTRY_TERMS,
    gradeKinds: GRADE_KINDS,
    collegeDefaults: collegeCoeffDefaults(),
    success: req.query.success || null,
  });
}

async function submitBulkGrades(req, res) {
  try {
    const result = await applyGrade({ user: req.user, payload: req.body });
    if (!result.ok) return res.redirect('/teacher/bulk-grades?error=1');
    res.redirect('/teacher/bulk-grades?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/teacher/bulk-grades?error=1');
  }
}

async function notificationsPage(req, res) {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.render('teacher/notifications', {
    user: req.user,
    notifications,
    success: req.query.success || null,
  });
}

async function markNotificationRead(req, res) {
  const { id } = req.params;
  await prisma.notification.updateMany({
    where: { id, userId: req.user.id },
    data: { readAt: new Date() },
  });
  if (req.accepts('json')) return res.json({ ok: true });
  res.redirect('/teacher/notifications?success=1');
}

async function markAllNotificationsRead(req, res) {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.redirect('/teacher/notifications?success=all');
}

async function accountSettingsPage(req, res) {
  res.render('teacher/account', {
    user: req.user,
    error: req.query.error || null,
    success: req.query.success || null,
  });
}

async function accountExport(req, res) {
  const { exportTeacherAccountData } = require('../services/accountGdpr');
  const data = await exportTeacherAccountData(req.user.id);
  if (!data.ok) {
    return res.status(403).json({ error: 'Export non disponible pour ce compte.' });
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="educonnect-export-${req.user.id}.json"`);
  return res.send(JSON.stringify(data, null, 2));
}

async function accountDeleteRequest(req, res) {
  const { requestAccountDeletion } = require('../services/accountGdpr');
  const { destroyAuthSession } = require('../middleware/auth');
  const { logAudit } = require('../utils/audit');

  const result = await requestAccountDeletion(req.user.id, {
    confirmation: req.body?.confirmation,
  });

  if (!result.ok) {
    return res.redirect('/teacher/account?error=confirmation');
  }

  await logAudit({
    action: 'account_delete_request',
    entity: 'User',
    entityId: req.user.id,
    user: req.user,
    ip: req.ip,
    sensitive: true,
  });

  await destroyAuthSession(req, res);
  return res.redirect('/auth/login?deleted=1');
}

module.exports = {
  dashboard,
  students,
  grades,
  createGrade,
  absences,
  createAbsence,
  homeworks,
  homeworkEvents,
  createHomework,
  schedulePage,
  createSchedule,
  attendancePage,
  submitAttendance,
  attendanceTypeFromStatus,
  bulkGradesPage,
  submitBulkGrades,
  notificationsPage,
  markNotificationRead,
  markAllNotificationsRead,
  accountSettingsPage,
  accountExport,
  accountDeleteRequest,
};
