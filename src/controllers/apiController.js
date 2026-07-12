const prisma = require('../config/database');

function getSchoolIdForUser(user) {
  if (user.school?.id) return user.school.id;
  if (user.teacher?.schoolId) return user.teacher.schoolId;
  return null;
}

async function listStudents(req, res) {
  const schoolId = getSchoolIdForUser(req.user);
  if (!schoolId) return res.status(403).json({ error: 'Accès école requis' });

  const students = await prisma.student.findMany({
    where: { schoolId },
    include: { class: { select: { id: true, name: true, level: true } } },
    orderBy: { lastName: 'asc' },
  });

  res.json({ data: students });
}

async function getStudent(req, res) {
  const schoolId = getSchoolIdForUser(req.user);
  const student = await prisma.student.findFirst({
    where: { id: req.params.id, schoolId },
    include: { class: true },
  });
  if (!student) return res.status(404).json({ error: 'Élève introuvable' });
  res.json({ data: student });
}

async function listClasses(req, res) {
  const schoolId = getSchoolIdForUser(req.user);
  if (!schoolId) return res.status(403).json({ error: 'Accès école requis' });

  const classes = await prisma.class.findMany({
    where: { schoolId },
    include: { _count: { select: { students: true } } },
    orderBy: { name: 'asc' },
  });

  res.json({ data: classes });
}

async function listNotifications(req, res) {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: parseInt(req.query.limit, 10) || 50,
  });
  res.json({ data: notifications });
}

async function markNotificationRead(req, res) {
  const updated = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user.id },
    data: { readAt: new Date() },
  });
  if (!updated.count) return res.status(404).json({ error: 'Notification introuvable' });
  res.json({ ok: true });
}

module.exports = {
  listStudents,
  getStudent,
  listClasses,
  listNotifications,
  markNotificationRead,
};
