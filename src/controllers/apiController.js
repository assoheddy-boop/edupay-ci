const prisma = require('../config/database');

function getSchoolIdForUser(user) {
  if (user.school?.id) return user.school.id;
  if (user.teacher?.schoolId) return user.teacher.schoolId;
  return null;
}

function studentWhereForUser(user) {
  const schoolId = getSchoolIdForUser(user);
  if (!schoolId) return null;
  if (user.role === 'TEACHER' && user.teacher?.id) {
    return { schoolId, class: { teachers: { some: { teacherId: user.teacher.id } } } };
  }
  return { schoolId };
}

function classWhereForUser(user) {
  const schoolId = getSchoolIdForUser(user);
  if (!schoolId) return null;
  if (user.role === 'TEACHER' && user.teacher?.id) {
    return { schoolId, teachers: { some: { teacherId: user.teacher.id } } };
  }
  return { schoolId };
}

async function listStudents(req, res) {
  const where = studentWhereForUser(req.user);
  if (!where) return res.status(403).json({ error: 'Accès école requis' });

  const students = await prisma.student.findMany({
    where,
    include: { class: { select: { id: true, name: true, level: true } } },
    orderBy: { lastName: 'asc' },
  });

  res.json({ data: students });
}

async function getStudent(req, res) {
  const where = studentWhereForUser(req.user);
  if (!where) return res.status(403).json({ error: 'Accès école requis' });
  const student = await prisma.student.findFirst({
    where: { ...where, id: req.params.id },
    include: { class: true },
  });
  if (!student) return res.status(404).json({ error: 'Élève introuvable' });
  res.json({ data: student });
}

async function listClasses(req, res) {
  const where = classWhereForUser(req.user);
  if (!where) return res.status(403).json({ error: 'Accès école requis' });

  const classes = await prisma.class.findMany({
    where,
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
  studentWhereForUser,
  classWhereForUser,
};
