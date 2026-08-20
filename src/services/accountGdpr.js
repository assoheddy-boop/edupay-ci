const prisma = require('../config/database');
const { revokeUserRefreshTokens } = require('../utils/refreshToken');
const { listConsents } = require('../../services/ConsentService');

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function exportParentAccountData(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      parentProfile: {
        include: {
          children: {
            include: {
              student: {
                include: {
                  class: { select: { id: true, name: true, schoolYear: true, schoolId: true } },
                  school: { select: { id: true, name: true, city: true } },
                },
              },
            },
          },
        },
      },
      consents: true,
      notifications: { orderBy: { createdAt: 'desc' }, take: 500 },
      sentMessages: { orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, content: true, createdAt: true, receiverId: true } },
      receivedMessages: { orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, content: true, createdAt: true, senderId: true } },
    },
  });

  if (!user?.parentProfile) return { ok: false, error: 'not_parent' };

  const studentIds = user.parentProfile.children.map((c) => c.studentId);
  const [payments, justifications] = await Promise.all([
    studentIds.length
      ? prisma.payment.findMany({
        where: { studentId: { in: studentIds } },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true, amount: true, status: true, method: true, createdAt: true, studentId: true,
        },
      })
      : [],
    prisma.absenceJustification.findMany({
      where: { parentId: user.parentProfile.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, motif: true, status: true, createdAt: true, studentId: true,
      },
    }),
  ]);

  const consents = await listConsents(userId);

  return {
    ok: true,
    exportedAt: new Date().toISOString(),
    profile: sanitizeUser(user),
    children: user.parentProfile.children.map((link) => ({
      relation: link.relation,
      student: {
        id: link.student.id,
        firstName: link.student.firstName,
        lastName: link.student.lastName,
        matricule: link.student.matricule,
        class: link.student.class,
        school: link.student.school || link.student.class?.schoolId,
      },
    })),
    consents,
    payments,
    justifications,
    notifications: user.notifications,
    messages: {
      sent: user.sentMessages,
      received: user.receivedMessages,
    },
  };
}

async function exportTeacherAccountData(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      teacher: {
        include: {
          school: { select: { id: true, name: true, city: true } },
          classes: { include: { class: { select: { id: true, name: true } } } },
        },
      },
      notifications: { orderBy: { createdAt: 'desc' }, take: 200 },
    },
  });

  if (!user?.teacher) return { ok: false, error: 'not_teacher' };

  return {
    ok: true,
    exportedAt: new Date().toISOString(),
    profile: sanitizeUser(user),
    teacher: {
      subject: user.teacher.subject,
      school: user.teacher.school,
      classes: user.teacher.classes.map((tc) => tc.class),
    },
    notifications: user.notifications,
  };
}

async function requestAccountDeletion(userId, { confirmation } = {}) {
  const confirm = String(confirmation || '').trim().toUpperCase();
  if (confirm !== 'SUPPRIMER') {
    return { ok: false, error: 'confirmation' };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: 'user' };
  if (!user.isActive) return { ok: true, alreadyInactive: true };

  const anonymizedEmail = `deleted+${user.id}@educonnect.invalid`;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        email: anonymizedEmail,
        phone: null,
        photoUrl: null,
      },
    }),
  ]);

  await revokeUserRefreshTokens(userId);

  return { ok: true, deactivated: true };
}

module.exports = {
  exportParentAccountData,
  exportTeacherAccountData,
  requestAccountDeletion,
};
