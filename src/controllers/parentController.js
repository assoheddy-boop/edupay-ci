const prisma = require('../config/database');
const { findSchoolByCode } = require('../utils/schoolCode');
const { logAudit } = require('../utils/audit');

async function dashboard(req, res) {
  const parent = req.user.parentProfile;
  const children = parent
    ? await prisma.parentStudent.findMany({
        where: { parentId: parent.id },
        include: {
          student: {
            include: {
              class: { include: { school: true } },
              grades: { orderBy: { createdAt: 'desc' }, take: 5 },
              absences: { orderBy: { date: 'desc' }, take: 5 },
              payments: { orderBy: { createdAt: 'desc' }, take: 5 },
            },
          },
        },
      })
    : [];

  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: req.user.id, readAt: null },
  });

  res.render('parent/dashboard', {
    user: req.user,
    children,
    notifications,
    unreadCount,
    error: req.query.error,
    success: req.query.success,
  });
}

async function payments(req, res) {
  const parent = req.user.parentProfile;
  const children = parent
    ? await prisma.parentStudent.findMany({
        where: { parentId: parent.id },
        include: {
          student: {
            include: {
              class: { include: { school: true } },
              payments: { include: { feeType: true }, orderBy: { createdAt: 'desc' } },
            },
          },
        },
      })
    : [];

  res.render('parent/payments', { user: req.user, children, error: null, success: null });
}

async function createPayment(req, res) {
  const { studentId, amount, feeTypeId, reference } = req.body;
  const proofUrl = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    await prisma.payment.create({
      data: {
        studentId,
        amount: parseInt(amount, 10),
        feeTypeId: feeTypeId || null,
        reference,
        proofUrl,
        status: 'PENDING',
      },
    });

    const school = await prisma.school.findFirst({
      where: { classes: { some: { students: { some: { id: studentId } } } } },
      include: { admin: true },
    });

    if (school?.admin) {
      await prisma.notification.create({
        data: {
          userId: school.admin.id,
          type: 'PAYMENT',
          title: 'Nouveau paiement en attente',
          body: `Un parent a soumis une preuve de paiement de ${amount} FCFA.`,
        },
      });
    }

    res.redirect('/parent/payments?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/parent/payments?error=1');
  }
}

async function grades(req, res) {
  const parent = req.user.parentProfile;
  const children = parent
    ? await prisma.parentStudent.findMany({
        where: { parentId: parent.id },
        include: {
          student: {
            include: {
              class: true,
              grades: { orderBy: [{ period: 'desc' }, { subject: 'asc' }] },
              bulletins: { orderBy: { generatedAt: 'desc' } },
            },
          },
        },
      })
    : [];

  res.render('parent/grades', { user: req.user, children });
}

async function addChild(req, res) {
  const { schoolCode, matricule } = req.body;
  try {
    const school = await findSchoolByCode(schoolCode);
    if (!school) {
      return res.redirect('/parent/dashboard?error=ecole');
    }

    const student = await prisma.student.findFirst({
      where: {
        schoolId: school.id,
        matricule: { equals: matricule.trim(), mode: 'insensitive' },
      },
    });

    if (!student) {
      return res.redirect('/parent/dashboard?error=eleve');
    }

    const existing = await prisma.parentStudent.findUnique({
      where: {
        parentId_studentId: {
          parentId: req.user.parentProfile.id,
          studentId: student.id,
        },
      },
    });
    if (existing) {
      return res.redirect('/parent/dashboard?error=deja');
    }

    await prisma.parentStudent.create({
      data: { parentId: req.user.parentProfile.id, studentId: student.id },
    });

    await logAudit({
      action: 'parent_link_child',
      entity: 'ParentStudent',
      entityId: student.id,
      user: req.user,
      ip: req.ip,
      details: { schoolId: school.id, matricule },
    });

    res.redirect('/parent/dashboard?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/parent/dashboard?error=1');
  }
}

async function selectSchool(req, res) {
  const { schoolId } = req.body;
  const { getParentSchoolIds } = require('../middleware/modules');
  const allowed = await getParentSchoolIds(req.user.parentProfile.id);
  if (allowed.includes(schoolId)) {
    res.cookie('selectedSchoolId', schoolId, { maxAge: 30 * 24 * 60 * 60 * 1000 });
  }
  res.redirect(req.get('Referer') || '/parent/dashboard');
}

async function notificationsPage(req, res) {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.render('parent/notifications', {
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
  res.redirect('/parent/notifications?success=1');
}

async function markAllNotificationsRead(req, res) {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.redirect('/parent/notifications?success=all');
}

async function homeworks(req, res) {
  const parent = req.user.parentProfile;
  const children = parent
    ? await prisma.parentStudent.findMany({
        where: { parentId: parent.id },
        include: {
          student: {
            include: {
              class: true,
              homeworks: {
                include: {
                  homework: {
                    include: { teacher: { include: { user: true } }, class: true },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  res.render('parent/homeworks', { user: req.user, children });
}

async function timeline(req, res) {
  const parent = req.user.parentProfile;
  if (!parent) return res.render('parent/timeline', { user: req.user, events: [] });

  const children = await prisma.parentStudent.findMany({
    where: { parentId: parent.id },
    select: { studentId: true, student: { select: { firstName: true, lastName: true } } },
  });
  const studentIds = children.map((c) => c.studentId);
  const nameMap = Object.fromEntries(children.map((c) => [c.studentId, c.student]));

  const [grades, absences, payments, transport, health, badges, behavior, homeworks, notifications] =
    await Promise.all([
      prisma.grade.findMany({ where: { studentId: { in: studentIds } }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.absence.findMany({ where: { studentId: { in: studentIds } }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.payment.findMany({ where: { studentId: { in: studentIds } }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.transportLog.findMany({ where: { studentId: { in: studentIds } }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.healthIncident.findMany({ where: { studentId: { in: studentIds } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.badge.findMany({ where: { studentId: { in: studentIds } }, orderBy: { awardedAt: 'desc' }, take: 20 }),
      prisma.behaviorNote.findMany({ where: { studentId: { in: studentIds } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.homeworkSubmission.findMany({
        where: { studentId: { in: studentIds } },
        include: { homework: true },
        orderBy: { homework: { createdAt: 'desc' } },
        take: 20,
      }),
      prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

  const { TRANSPORT_LABELS } = require('../utils/notify');

  const events = [
    ...grades.map((g) => ({ type: 'grade', date: g.createdAt, studentId: g.studentId, text: `${g.subject}: ${g.value}/${g.maxValue}` })),
    ...absences.map((a) => ({ type: 'absence', date: a.createdAt, studentId: a.studentId, text: `${a.type} — ${a.reason || ''}` })),
    ...payments.map((p) => ({ type: 'payment', date: p.createdAt, studentId: p.studentId, text: `${p.amount} FCFA — ${p.status}` })),
    ...transport.map((t) => ({ type: 'transport', date: t.createdAt, studentId: t.studentId, text: TRANSPORT_LABELS[t.event] })),
    ...health.map((h) => ({ type: 'health', date: h.createdAt, studentId: h.studentId, text: `${h.type}: ${h.description}` })),
    ...badges.map((b) => ({ type: 'badge', date: b.awardedAt, studentId: b.studentId, text: `Badge: ${b.label}` })),
    ...behavior.map((b) => ({ type: 'behavior', date: b.createdAt, studentId: b.studentId, text: b.message })),
    ...homeworks.map((h) => ({ type: 'homework', date: h.homework.createdAt, studentId: h.studentId, text: `Devoir: ${h.homework.title}` })),
    ...notifications.map((n) => ({ type: 'notif', date: n.createdAt, studentId: null, text: `${n.title} — ${n.body}` })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  res.render('parent/timeline', { user: req.user, events, nameMap });
}

module.exports = {
  dashboard,
  payments,
  createPayment,
  grades,
  addChild,
  selectSchool,
  notificationsPage,
  markNotificationRead,
  markAllNotificationsRead,
  homeworks,
  timeline,
};
