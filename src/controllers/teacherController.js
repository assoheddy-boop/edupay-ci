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
  const classLinks = await prisma.teacherClass.findMany({
    where: { teacherId: teacher.id },
    include: { class: { include: { students: true } } },
  });

  res.render('teacher/grades', { user: req.user, teacher, classLinks, error: null, success: null });
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
    await prisma.absence.create({
      data: {
        studentId,
        date: new Date(date),
        type: type || 'ABSENCE',
        reason,
        recordedBy: req.user.teacher.id,
      },
    });

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { parents: { include: { parent: true } } },
    });

    for (const link of student?.parents || []) {
      await sendNotification(
        link.parent.userId,
        'absence_reported',
        `${student.firstName} ${student.lastName} — ${type === 'LATE' ? 'retard' : 'absence'} : ${reason || 'Sans motif'}.`,
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
  res.render('teacher/attendance', {
    user: req.user,
    classLinks,
    statusByStudent,
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
  const classLinks = await prisma.teacherClass.findMany({
    where: { teacherId: req.user.teacher.id },
    include: { class: { include: { students: { orderBy: { lastName: 'asc' } } } } },
  });
  res.render('teacher/bulk-grades', { user: req.user, classLinks, success: req.query.success || null });
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
};
