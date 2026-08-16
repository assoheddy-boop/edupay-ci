const prisma = require('../config/database');
const { notifyStudentParents, TRANSPORT_LABELS } = require('../utils/notify');

async function getTeacherStudents(teacherId) {
  const classLinks = await prisma.teacherClass.findMany({
    where: { teacherId },
    include: { class: { include: { students: { orderBy: { lastName: 'asc' } } } } },
  });
  return classLinks;
}

async function transportPage(req, res) {
  const classLinks = await getTeacherStudents(req.user.teacher.id);
  const logs = await prisma.transportLog.findMany({
    where: { student: { class: { teachers: { some: { teacherId: req.user.teacher.id } } } } },
    include: { student: true },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  res.render('teacher/transport', {
    user: req.user,
    classLinks,
    logs,
    labels: TRANSPORT_LABELS,
    success: req.query.success || null,
  });
}

async function createTransportLog(req, res) {
  const { studentId, event, note } = req.body;
  try {
    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        class: { teachers: { some: { teacherId: req.user.teacher.id } } },
      },
    });
    if (!student) return res.redirect('/teacher/transport?error=1');

    await prisma.transportLog.create({ data: { studentId, event, note } });

    await notifyStudentParents(studentId, {
      type: 'TRANSPORT',
      title: TRANSPORT_LABELS[event] || 'Transport',
      body: `${student.firstName} ${student.lastName} — ${TRANSPORT_LABELS[event]}${note ? ` (${note})` : ''}.`,
      sms: true,
    });

    res.redirect('/teacher/transport?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/teacher/transport?error=1');
  }
}

async function behaviorPage(req, res) {
  const classLinks = await getTeacherStudents(req.user.teacher.id);
  const { BADGE_PRESETS } = require('../utils/notify');

  const recent = await prisma.behaviorNote.findMany({
    where: { teacherId: req.user.teacher.id },
    include: { student: true },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });

  const badges = await prisma.badge.findMany({
    where: { teacherId: req.user.teacher.id },
    include: { student: true },
    orderBy: { awardedAt: 'desc' },
    take: 15,
  });

  res.render('teacher/behavior', {
    user: req.user,
    classLinks,
    badgePresets: BADGE_PRESETS,
    recent,
    badges,
    success: req.query.success || null,
  });
}

async function createBehaviorNote(req, res) {
  const { studentId, type, message } = req.body;
  try {
    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        class: { teachers: { some: { teacherId: req.user.teacher.id } } },
      },
    });
    if (!student) return res.redirect('/teacher/behavior?error=1');

    await prisma.behaviorNote.create({
      data: { studentId, teacherId: req.user.teacher.id, type, message },
    });

    await notifyStudentParents(studentId, {
      type: 'BEHAVIOR',
      title: type === 'POSITIVE' ? 'Bon comportement' : 'Alerte discipline',
      body: `${student.firstName} : ${message}`,
    });

    res.redirect('/teacher/behavior?success=note');
  } catch (err) {
    console.error(err);
    res.redirect('/teacher/behavior?error=1');
  }
}

async function awardBadge(req, res) {
  const { studentId, type, label } = req.body;
  try {
    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        class: { teachers: { some: { teacherId: req.user.teacher.id } } },
      },
    });
    if (!student) return res.redirect('/teacher/behavior?error=1');

    await prisma.badge.create({
      data: { studentId, teacherId: req.user.teacher.id, type, label },
    });

    await notifyStudentParents(studentId, {
      type: 'BEHAVIOR',
      title: 'Badge remis en classe',
      body: `${student.firstName} a reçu le badge « ${label} » — à féliciter à la maison !`,
    });

    res.redirect('/teacher/behavior?success=badge');
  } catch (err) {
    console.error(err);
    res.redirect('/teacher/behavior?error=1');
  }
}

async function healthPage(req, res) {
  const classLinks = await getTeacherStudents(req.user.teacher.id);
  const incidents = await prisma.healthIncident.findMany({
    where: { student: { class: { teachers: { some: { teacherId: req.user.teacher.id } } } } },
    include: { student: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  res.render('teacher/health', { user: req.user, classLinks, incidents, success: req.query.success || null });
}

async function createHealthIncident(req, res) {
  const { studentId, type, description } = req.body;
  try {
    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        class: { teachers: { some: { teacherId: req.user.teacher.id } } },
      },
    });
    if (!student) return res.redirect('/teacher/health?error=1');

    await prisma.healthIncident.create({ data: { studentId, type, description } });

    await notifyStudentParents(studentId, {
      type: 'HEALTH',
      title: `Santé : ${type}`,
      body: `${student.firstName} ${student.lastName} — ${description}`,
      sms: true,
    });

    res.redirect('/teacher/health?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/teacher/health?error=1');
  }
}

async function recordCanteen(req, res) {
  const { studentId, menuId, ate, note } = req.body;
  try {
    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        class: { teachers: { some: { teacherId: req.user.teacher.id } } },
      },
    });
    if (!student) return res.redirect('/teacher/canteen?error=1');

    await prisma.canteenRecord.upsert({
      where: { studentId_menuId: { studentId, menuId } },
      create: { studentId, menuId, ate: ate === 'true', note },
      update: { ate: ate === 'true', note },
    });

    res.redirect('/teacher/canteen?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/teacher/canteen?error=1');
  }
}

async function canteenPage(req, res) {
  const classLinks = await getTeacherStudents(req.user.teacher.id);
  const schoolId = req.user.teacher.schoolId;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const menus = await prisma.canteenMenu.findMany({
    where: { schoolId, date: { gte: today } },
    orderBy: { date: 'asc' },
    take: 7,
    include: { records: true },
  });

  res.render('teacher/canteen', { user: req.user, classLinks, menus, success: req.query.success || null });
}

// ─── École ───────────────────────────────────────────────────────────────────

async function schoolCanteenPage(req, res) {
  const schoolId = req.user.school.id;
  const menus = await prisma.canteenMenu.findMany({
    where: { schoolId },
    orderBy: { date: 'desc' },
    take: 14,
  });

  res.render('school/canteen', {
    user: req.user,
    school: req.user.school,
    menus,
    success: req.query.success || null,
  });
}

async function createCanteenMenu(req, res) {
  const { date, menu } = req.body;
  try {
    await prisma.canteenMenu.create({
      data: { schoolId: req.user.school.id, date: new Date(date), menu },
    });
    res.redirect('/school/canteen?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/school/canteen?error=1');
  }
}

async function schoolLostItemsPage(req, res) {
  const items = await prisma.lostItem.findMany({
    where: { schoolId: req.user.school.id },
    include: { student: true },
    orderBy: { foundAt: 'desc' },
  });
  const students = await prisma.student.findMany({
    where: { class: { schoolId: req.user.school.id } },
    orderBy: { lastName: 'asc' },
  });

  res.render('school/lost-items', {
    user: req.user,
    items,
    students,
    success: req.query.success || null,
  });
}

async function createLostItem(req, res) {
  const { description, studentId } = req.body;
  const photoUrl = req.file ? (req.file.url || `/uploads/lost-items/${req.file.filename}`) : null;

  try {
    const item = await prisma.lostItem.create({
      data: {
        schoolId: req.user.school.id,
        description,
        studentId: studentId || null,
        photoUrl,
      },
    });

    if (studentId) {
      await notifyStudentParents(studentId, {
        type: 'GENERAL',
        title: 'Objet retrouvé',
        body: `Un objet a été retrouvé à l'école : ${description}. Passez récupérer.`,
      });
    }

    res.redirect('/school/lost-items?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/school/lost-items?error=1');
  }
}

async function claimLostItem(req, res) {
  const { id } = req.params;
  await prisma.lostItem.update({
    where: { id, schoolId: req.user.school.id },
    data: { claimed: true },
  });
  res.redirect('/school/lost-items?success=claimed');
}

async function schoolActivitiesPage(req, res) {
  const activities = await prisma.extracurricular.findMany({
    where: { schoolId: req.user.school.id },
    include: { _count: { select: { enrollments: true } } },
    orderBy: { name: 'asc' },
  });

  res.render('school/activities', {
    user: req.user,
    activities,
    success: req.query.success || null,
  });
}

async function createActivity(req, res) {
  const { name, description, schedule } = req.body;
  try {
    await prisma.extracurricular.create({
      data: { schoolId: req.user.school.id, name, description, schedule },
    });
    res.redirect('/school/activities?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/school/activities?error=1');
  }
}

async function schoolPickupPage(req, res) {
  const authorizations = await prisma.pickupAuthorization.findMany({
    where: { schoolId: req.user.school.id },
    include: { student: { include: { class: true } } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  res.render('school/pickup', {
    user: req.user,
    authorizations,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function validatePickup(req, res) {
  const { qrCode } = req.body;
  try {
    const auth = await prisma.pickupAuthorization.findFirst({
      where: { qrCode, schoolId: req.user.school.id, usedAt: null, validUntil: { gte: new Date() } },
      include: { student: true },
    });

    if (!auth) return res.redirect('/school/pickup?error=invalid');

    await prisma.pickupAuthorization.update({
      where: { id: auth.id },
      data: { usedAt: new Date() },
    });

    await prisma.transportLog.create({
      data: { studentId: auth.studentId, event: 'PICKED_UP', note: `Récupéré par ${auth.authorizedPerson}` },
    });

    await notifyStudentParents(auth.studentId, {
      type: 'TRANSPORT',
      title: 'Enfant récupéré',
      body: `${auth.student.firstName} a été récupéré par ${auth.authorizedPerson}.`,
    });

    res.redirect(`/school/pickup?success=${encodeURIComponent(auth.student.firstName + ' — ' + auth.authorizedPerson)}`);
  } catch (err) {
    console.error(err);
    res.redirect('/school/pickup?error=1');
  }
}

// ─── Parent ──────────────────────────────────────────────────────────────────

async function getParentChildren(parentId) {
  return prisma.parentStudent.findMany({
    where: { parentId },
    include: {
      student: {
        include: {
          class: { include: { school: true } },
          transportLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
          canteenRecords: { include: { menu: true }, orderBy: { menu: { date: 'desc' } }, take: 10 },
          badges: { orderBy: { awardedAt: 'desc' }, take: 10 },
          behaviorNotes: { orderBy: { createdAt: 'desc' }, take: 10 },
          healthIncidents: { orderBy: { createdAt: 'desc' }, take: 10 },
          lostItems: { where: { claimed: false }, orderBy: { foundAt: 'desc' } },
        },
      },
    },
  });
}

async function parentSuiviPage(req, res) {
  const parent = req.user.parentProfile;
  const children = parent ? await getParentChildren(parent.id) : [];
  const { TRANSPORT_LABELS } = require('../utils/notify');

  res.render('parent/suivi', { user: req.user, children, transportLabels: TRANSPORT_LABELS });
}

async function parentPickupPage(req, res) {
  const parent = req.user.parentProfile;
  const children = parent
    ? await prisma.parentStudent.findMany({
        where: { parentId: parent.id },
        include: {
          student: {
            include: {
              class: true,
              pickupAuthorizations: { orderBy: { createdAt: 'desc' }, take: 5 },
            },
          },
        },
      })
    : [];

  res.render('parent/pickup', { user: req.user, children, success: req.query.success || null });
}

async function createPickupAuth(req, res) {
  const { studentId, authorizedPerson, authorizedPhone, validUntil } = req.body;
  const crypto = require('crypto');
  const { generateQrDataUrl } = require('../utils/qr');

  try {
    const link = await prisma.parentStudent.findFirst({
      where: { parentId: req.user.parentProfile.id, studentId },
      include: { student: { include: { class: true } } },
    });
    if (!link) return res.redirect('/parent/pickup?error=1');

    const qrCode = `EP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const qrDataUrl = await generateQrDataUrl(qrCode);

    await prisma.pickupAuthorization.create({
      data: {
        studentId,
        schoolId: link.student.class.schoolId,
        authorizedPerson,
        authorizedPhone,
        qrCode,
        qrDataUrl,
        validUntil: new Date(validUntil),
      },
    });

    res.redirect('/parent/pickup?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/parent/pickup?error=1');
  }
}

async function parentActivitiesPage(req, res) {
  const parent = req.user.parentProfile;
  const children = parent ? await getParentChildren(parent.id) : [];

  const schoolIds = [...new Set(children.map((c) => c.student.class.schoolId))];
  const activities = schoolIds.length
    ? await prisma.extracurricular.findMany({
        where: { schoolId: { in: schoolIds }, isActive: true },
        include: { enrollments: true },
      })
    : [];

  res.render('parent/activities', { user: req.user, children, activities, success: req.query.success || null });
}

async function enrollActivity(req, res) {
  const { studentId, activityId } = req.body;
  try {
    const link = await prisma.parentStudent.findFirst({
      where: { parentId: req.user.parentProfile.id, studentId },
    });
    if (!link) return res.redirect('/parent/activities?error=1');

    await prisma.extracurricularEnrollment.create({ data: { studentId, activityId } });
    res.redirect('/parent/activities?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/parent/activities?error=1');
  }
}

async function parentPremiumPage(viewName, req, res, extra = {}) {
  const parent = req.user.parentProfile;
  const children = parent ? await getParentChildren(parent.id) : [];
  res.render(`parent/${viewName}`, {
    user: req.user,
    children,
    transportLabels: TRANSPORT_LABELS,
    ...extra,
  });
}

async function parentTransportPage(req, res) {
  return parentPremiumPage('transport', req, res);
}

async function parentCanteenPage(req, res) {
  return parentPremiumPage('canteen', req, res);
}

async function parentHealthPage(req, res) {
  return parentPremiumPage('health', req, res);
}

module.exports = {
  transportPage,
  createTransportLog,
  behaviorPage,
  createBehaviorNote,
  awardBadge,
  healthPage,
  createHealthIncident,
  canteenPage,
  recordCanteen,
  schoolCanteenPage,
  createCanteenMenu,
  schoolLostItemsPage,
  createLostItem,
  claimLostItem,
  schoolActivitiesPage,
  createActivity,
  schoolPickupPage,
  validatePickup,
  parentSuiviPage,
  parentPickupPage,
  createPickupAuth,
  parentActivitiesPage,
  enrollActivity,
  parentTransportPage,
  parentCanteenPage,
  parentHealthPage,
};
