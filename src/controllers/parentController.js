const prisma = require('../config/database');
const { findSchoolByCode } = require('../utils/schoolCode');
const { logAudit } = require('../utils/audit');
const { applyPayment } = require('../services/offlineActions');
const { calendarEventsJson, kindLabel } = require('../services/homeworkService');

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
              payments: { include: { feeType: true }, orderBy: { createdAt: 'desc' }, take: 5 },
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

  const studentIds = children.map((link) => link.student.id);
  const [pendingPayments, absenceCount, gradeCount] = studentIds.length
    ? await Promise.all([
      prisma.payment.count({ where: { studentId: { in: studentIds }, status: 'PENDING' } }),
      prisma.absence.count({ where: { studentId: { in: studentIds } } }),
      prisma.grade.count({ where: { studentId: { in: studentIds } } }),
    ])
    : [0, 0, 0];

  res.render('parent/dashboard', {
    user: req.user,
    children,
    notifications,
    unreadCount,
    summary: { pendingPayments, absenceCount, gradeCount },
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

  res.render('parent/payments', {
    user: req.user,
    children,
    error: req.query.error || null,
    success: req.query.success || null,
  });
}

async function createPayment(req, res) {
  try {
    const result = await applyPayment({
      user: req.user,
      payload: req.body,
      file: req.file || null,
    });
    if (!result.ok) {
      const code = result.error === 'child' ? 'child' : (result.error || '1');
      return res.redirect(`/parent/payments?error=${code}`);
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

  const flat = (children || []).flatMap((link) =>
    (link.student.homeworks || []).map((sub) => sub.homework),
  );

  res.render('parent/homeworks', {
    user: req.user,
    children,
    calendarEventsJson: calendarEventsJson(flat),
  });
}

async function homeworkEvents(req, res) {
  const parent = req.user.parentProfile;
  if (!parent) return res.status(403).json({ ok: false, error: 'forbidden' });
  const children = await prisma.parentStudent.findMany({
    where: { parentId: parent.id },
    include: {
      student: {
        include: {
          homeworks: {
            include: { homework: { include: { class: true } } },
          },
        },
      },
    },
  });
  const flat = children.flatMap((link) => (link.student.homeworks || []).map((sub) => sub.homework));
  res.json({ ok: true, events: JSON.parse(calendarEventsJson(flat)) });
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
    ...homeworks.map((h) => ({ type: 'homework', date: h.homework.createdAt, studentId: h.studentId, text: `${kindLabel(h.homework.kind)}: ${h.homework.title}` })),
    ...notifications.map((n) => ({ type: 'notif', date: n.createdAt, studentId: null, text: `${n.title} — ${n.body}` })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  res.render('parent/timeline', { user: req.user, events, nameMap });
}

async function privacyPage(req, res) {
  const { listConsents, CONSENT_LABELS, CONSENT_HINTS } = require('../../services/ConsentService');
  const consents = await listConsents(req.user.id);
  res.render('parent/privacy', {
    user: req.user,
    consents,
    labels: CONSENT_LABELS,
    hints: CONSENT_HINTS,
    error: req.query.error || null,
    success: req.query.success || null,
  });
}

async function updateConsent(req, res) {
  const { upsertConsent } = require('../../services/ConsentService');
  const { type, action } = req.body;
  try {
    const result = await upsertConsent(req.user.id, type, action);
    if (!result.ok) return res.redirect('/parent/privacy?error=1');
    return res.redirect('/parent/privacy?success=1');
  } catch (err) {
    console.error(err);
    return res.redirect('/parent/privacy?error=1');
  }
}

async function handleFirstLoginConsent(req, res) {
  const { upsertConsent } = require('../../services/ConsentService');
  const { getPrefsCookieOptions, safeBack } = require('../utils/cookies');
  const { DISMISS_COOKIE } = require('../middleware/consentPrompt');
  const action = String(req.body?.action || '').trim().toLowerCase();
  try {
    const status = (action === 'accept' || action === 'grant') ? 'GRANTED' : 'PENDING';
    const result = await upsertConsent(req.user.id, 'DATA_PROCESSING', status);
    if (!result.ok) return res.redirect('/parent/privacy?error=1');
    res.cookie(DISMISS_COOKIE, '1', getPrefsCookieOptions());
    const back = safeBack(req);
    return res.redirect(back === '/' ? '/parent/dashboard' : back);
  } catch (err) {
    console.error(err);
    return res.redirect('/parent/privacy?error=1');
  }
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
  homeworkEvents,
  timeline,
  privacyPage,
  updateConsent,
  handleFirstLoginConsent,
};
