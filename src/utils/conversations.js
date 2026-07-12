const prisma = require('../config/database');

async function getPartnersForUser(user) {
  if (user.role === 'SCHOOL_ADMIN' && user.school) {
    const links = await prisma.parentStudent.findMany({
      where: { student: { class: { schoolId: user.school.id } } },
      include: {
        parent: { include: { user: true } },
        student: true,
      },
    });

    const map = new Map();
    links.forEach((link) => {
      const u = link.parent.user;
      if (!map.has(u.id)) {
        map.set(u.id, { user: u, students: [] });
      }
      map.get(u.id).students.push(link.student);
    });
    return [...map.values()];
  }

  if (user.role === 'PARENT' && user.parentProfile) {
    const children = await prisma.parentStudent.findMany({
      where: { parentId: user.parentProfile.id },
      include: {
        student: {
          include: {
            class: {
              include: {
                school: { include: { admin: true } },
                teachers: { include: { teacher: { include: { user: true } } } },
              },
            },
          },
        },
      },
    });

    const map = new Map();
    children.forEach((link) => {
      const school = link.student.class.school;
      if (school?.admin && !map.has(school.admin.id)) {
        map.set(school.admin.id, {
          user: school.admin,
          label: `Admin — ${school.name}`,
          students: [],
        });
      }
      link.student.class.teachers.forEach((tc) => {
        const t = tc.teacher.user;
        if (!map.has(t.id)) {
          map.set(t.id, {
            user: t,
            label: `Enseignant — ${tc.teacher.subject || 'Classe'}`,
            students: [],
          });
        }
        map.get(t.id).students.push(link.student);
      });
    });
    return [...map.values()];
  }

  if (user.role === 'TEACHER' && user.teacher) {
    const classLinks = await prisma.teacherClass.findMany({
      where: { teacherId: user.teacher.id },
      include: {
        class: {
          include: {
            students: {
              include: {
                parents: { include: { parent: { include: { user: true } } } },
              },
            },
          },
        },
      },
    });

    const map = new Map();
    classLinks.forEach((cl) => {
      cl.class.students.forEach((student) => {
        student.parents.forEach((ps) => {
          const u = ps.parent.user;
          if (!map.has(u.id)) {
            map.set(u.id, { user: u, students: [] });
          }
          if (!map.get(u.id).students.find((s) => s.id === student.id)) {
            map.get(u.id).students.push(student);
          }
        });
      });
    });
    return [...map.values()];
  }

  return [];
}

async function canMessage(user, partnerId) {
  const partners = await getPartnersForUser(user);
  return partners.some((p) => p.user.id === partnerId);
}

async function getConversation(userId, partnerId) {
  return prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId, receiverId: partnerId },
        { senderId: partnerId, receiverId: userId },
      ],
    },
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, role: true } },
      receiver: { select: { id: true, firstName: true, lastName: true, role: true } },
      student: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function markConversationRead(userId, partnerId) {
  await prisma.message.updateMany({
    where: { senderId: partnerId, receiverId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}

async function countUnread(userId) {
  return prisma.message.count({
    where: { receiverId: userId, readAt: null },
  });
}

module.exports = {
  getPartnersForUser,
  canMessage,
  getConversation,
  markConversationRead,
  countUnread,
};
