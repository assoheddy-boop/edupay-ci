const prisma = require('../config/database');
const { loadLinkedStudent } = require('../utils/studentAccount');
const { calendarEventsJson } = require('../services/homeworkService');
const { getStudentTimetable, VALID_DAYS } = require('../../services/TimetableService');
const { streamBulletinPdf } = require('../services/bulletinService');
const { sendPdfDownload } = require('../utils/pdfOutput');

async function requireStudentRecord(req, res) {
  const student = await loadLinkedStudent(req.user);
  if (!student) {
    if (req.accepts('html')) {
      return res.status(403).render('error', {
        message: 'Aucun profil élève lié à ce compte. Contactez l’école.',
        user: req.user,
      });
    }
    return res.status(403).json({ error: 'Profil élève introuvable' });
  }
  return student;
}

async function dashboard(req, res) {
  const student = await requireStudentRecord(req, res);
  if (!student || res.headersSent) return;

  const [grades, bulletins, absences, homeworkSubs, timetable] = await Promise.all([
    prisma.grade.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.bulletin.findMany({
      where: { studentId: student.id },
      orderBy: { generatedAt: 'desc' },
      take: 3,
    }),
    prisma.absence.count({ where: { studentId: student.id } }),
    prisma.homeworkSubmission.findMany({
      where: { studentId: student.id },
      include: {
        homework: { include: { teacher: { include: { user: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    getStudentTimetable(student.id),
  ]);

  const upcomingHomework = homeworkSubs
    .map((sub) => sub.homework)
    .filter(Boolean)
    .slice(0, 5);

  res.render('student/dashboard', {
    user: req.user,
    student,
    grades,
    bulletins,
    absenceCount: absences,
    upcomingHomework,
    timetableEntries: timetable.entries || [],
    days: VALID_DAYS,
  });
}

async function grades(req, res) {
  const student = await requireStudentRecord(req, res);
  if (!student || res.headersSent) return;

  const [gradesList, bulletins, deliberations] = await Promise.all([
    prisma.grade.findMany({
      where: { studentId: student.id },
      orderBy: [{ period: 'desc' }, { subject: 'asc' }],
    }),
    prisma.bulletin.findMany({
      where: { studentId: student.id },
      orderBy: { generatedAt: 'desc' },
    }),
    prisma.deliberation.findMany({
      where: { studentId: student.id },
      orderBy: [{ schoolYear: 'desc' }, { term: 'asc' }],
    }),
  ]);

  res.render('student/grades', {
    user: req.user,
    student,
    grades: gradesList,
    bulletins,
    deliberations,
  });
}

async function homeworks(req, res) {
  const student = await requireStudentRecord(req, res);
  if (!student || res.headersSent) return;

  const submissions = await prisma.homeworkSubmission.findMany({
    where: { studentId: student.id },
    include: {
      homework: {
        include: { teacher: { include: { user: true } }, class: true },
      },
    },
  });
  const items = submissions.map((sub) => sub.homework).filter(Boolean);

  res.render('student/homeworks', {
    user: req.user,
    student,
    homeworks: items,
    calendarEventsJson: calendarEventsJson(items),
  });
}

async function homeworkEvents(req, res) {
  const student = await requireStudentRecord(req, res);
  if (!student || res.headersSent) return;

  const submissions = await prisma.homeworkSubmission.findMany({
    where: { studentId: student.id },
    include: { homework: true },
  });
  const items = submissions.map((sub) => sub.homework).filter(Boolean);
  res.json({ ok: true, events: JSON.parse(calendarEventsJson(items)) });
}

async function timetable(req, res) {
  const student = await requireStudentRecord(req, res);
  if (!student || res.headersSent) return;

  const result = await getStudentTimetable(student.id);
  res.render('student/timetable', {
    user: req.user,
    student,
    entries: result.entries || [],
    days: VALID_DAYS,
  });
}

async function downloadBulletinPdf(req, res) {
  const student = await requireStudentRecord(req, res);
  if (!student || res.headersSent) return;

  const bulletin = await prisma.bulletin.findFirst({
    where: { id: req.params.bulletinId, studentId: student.id },
  });
  if (!bulletin) return res.redirect('/student/grades?error=bulletin');

  const school = student.class?.school || student.school;
  if (!school) return res.redirect('/student/grades?error=bulletin');

  try {
    const result = await streamBulletinPdf({
      studentId: student.id,
      period: bulletin.period,
      school,
    });
    if (result.error) return res.redirect(`/student/grades?error=${result.error}`);
    return sendPdfDownload(res, result);
  } catch (err) {
    console.error(err);
    return res.redirect('/student/grades?error=pdf');
  }
}

module.exports = {
  dashboard,
  grades,
  homeworks,
  homeworkEvents,
  timetable,
  downloadBulletinPdf,
  requireStudentRecord,
};
