const prisma = require('../config/database');
const { sendNotification } = require('../../services/NotificationService');

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
  const { studentId, subject, value, maxValue, period, comment } = req.body;
  try {
    await prisma.grade.create({
      data: {
        studentId,
        teacherId: req.user.teacher.id,
        subject,
        value: parseFloat(value),
        maxValue: parseFloat(maxValue || 20),
        period,
        comment,
      },
    });

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { parents: { include: { parent: true } } },
    });

    for (const link of student?.parents || []) {
      await prisma.notification.create({
        data: {
          userId: link.parent.userId,
          type: 'GENERAL',
          title: 'Nouvelle note',
          body: `${student.firstName} a reçu ${value}/${maxValue || 20} en ${subject}.`,
        },
      });
    }

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
    success: req.query.success || null,
  });
}

async function createHomework(req, res) {
  const { classId, title, description, dueDate } = req.body;
  const attachmentUrl = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const link = await prisma.teacherClass.findFirst({
      where: { teacherId: req.user.teacher.id, classId },
    });
    if (!link) return res.redirect('/teacher/homeworks?error=class');

    const homework = await prisma.homework.create({
      data: {
        classId,
        teacherId: req.user.teacher.id,
        title,
        description,
        dueDate: new Date(dueDate),
        attachmentUrl,
      },
    });

    const students = await prisma.student.findMany({
      where: { classId },
      include: { parents: { include: { parent: true } } },
    });

    for (const student of students) {
      for (const ps of student.parents) {
        await sendNotification(
          ps.parent.userId,
          'new_homework',
          `${title} — à rendre le ${new Date(dueDate).toLocaleDateString('fr-FR')} (${student.firstName}).`,
        );
      }
      await prisma.homeworkSubmission.create({
        data: { homeworkId: homework.id, studentId: student.id },
      });
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
  res.render('teacher/attendance', {
    user: req.user,
    classLinks,
    today: new Date().toISOString().slice(0, 10),
    success: req.query.success || null,
  });
}

async function submitAttendance(req, res) {
  const { classId, date, absentIds } = req.body;
  const absentList = Array.isArray(absentIds) ? absentIds : absentIds ? [absentIds] : [];

  try {
    const students = await prisma.student.findMany({
      where: { classId, class: { teachers: { some: { teacherId: req.user.teacher.id } } } },
    });

    for (const student of students) {
      if (!absentList.includes(student.id)) continue;

      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const existing = await prisma.absence.findFirst({
        where: {
          studentId: student.id,
          date: dayStart,
        },
      });
      if (existing) continue;

      await prisma.absence.create({
        data: {
          studentId: student.id,
          date: dayStart,
          type: 'ABSENCE',
          reason: 'Appel du jour',
          recordedBy: req.user.teacher.id,
        },
      });
      const parents = await prisma.parentStudent.findMany({
        where: { studentId: student.id },
        include: { parent: true },
      });
      for (const ps of parents) {
        await sendNotification(
          ps.parent.userId,
          'absence_reported',
          `${student.firstName} absent le ${new Date(date).toLocaleDateString('fr-FR')}.`,
        );
      }
    }

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
  const { subject, period, maxValue, classId } = req.body;
  const students = await prisma.student.findMany({
    where: { classId, class: { teachers: { some: { teacherId: req.user.teacher.id } } } },
  });

  try {
    for (const student of students) {
      const val = req.body[`grade_${student.id}`];
      if (!val || val === '') continue;
      await prisma.grade.create({
        data: {
          studentId: student.id,
          teacherId: req.user.teacher.id,
          subject,
          period,
          value: parseFloat(val),
          maxValue: parseFloat(maxValue || 20),
        },
      });
    }
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
  createHomework,
  schedulePage,
  createSchedule,
  attendancePage,
  submitAttendance,
  bulkGradesPage,
  submitBulkGrades,
};
