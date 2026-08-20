const prisma = require('../config/database');
const { hashPassword } = require('./password');
const { logAudit } = require('./audit');

async function createStudentUserAccount({
  email,
  password,
  studentId,
  firstName,
  lastName,
  phone,
  actor,
  ip,
}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const sid = String(studentId || '').trim();
  if (!normalizedEmail || !password || !sid) {
    return { ok: false, error: 'missing' };
  }

  const student = await prisma.student.findUnique({
    where: { id: sid },
    include: { class: { include: { school: true } }, user: true },
  });
  if (!student) return { ok: false, error: 'student' };
  if (student.user) return { ok: false, error: 'linked' };

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return { ok: false, error: 'email' };

  const hashed = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      password: hashed,
      firstName: firstName || student.firstName,
      lastName: lastName || student.lastName,
      phone: phone || null,
      role: 'STUDENT',
      studentId: student.id,
    },
    include: { student: { include: { class: true } } },
  });

  if (actor) {
    await logAudit({
      action: 'student_account_create',
      entity: 'User',
      entityId: user.id,
      user: actor,
      schoolId: student.schoolId || student.class?.schoolId,
      ip,
      details: { studentId: student.id, email: normalizedEmail },
    });
  }

  return { ok: true, user, student };
}

async function loadLinkedStudent(user) {
  if (!user?.studentId) return null;
  return prisma.student.findFirst({
    where: { id: user.studentId },
    include: {
      class: { include: { school: true } },
      user: { select: { id: true } },
    },
  });
}

module.exports = {
  createStudentUserAccount,
  loadLinkedStudent,
};
