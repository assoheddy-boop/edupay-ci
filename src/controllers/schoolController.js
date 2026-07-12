const prisma = require('../config/database');
const { logAudit } = require('../utils/audit');
const { hashPassword } = require('../utils/password');
const { generateBulletinForStudent, generateBulkBulletins } = require('../services/bulletinService');

async function dashboard(req, res) {
  const school = req.user.school;
  if (!school) return res.redirect('/auth/login');

  const [classes, students, teachers, pendingPayments, recentPayments] = await Promise.all([
    prisma.class.count({ where: { schoolId: school.id } }),
    prisma.student.count({ where: { schoolId: school.id } }),
    prisma.teacher.count({ where: { schoolId: school.id } }),
    prisma.payment.count({
      where: { status: 'PENDING', student: { schoolId: school.id } },
    }),
    prisma.payment.findMany({
      where: { student: { schoolId: school.id } },
      include: { student: true, feeType: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  res.render('school/dashboard', {
    user: req.user,
    school,
    stats: { classes, students, teachers, pendingPayments },
    recentPayments,
  });
}

async function settings(req, res) {
  res.render('school/settings', { user: req.user, school: req.user.school, success: null, error: null });
}

async function updateSettings(req, res) {
  const { waveNumber, omNumber, name, address, city, logoUrl } = req.body;
  try {
    const school = await prisma.school.update({
      where: { id: req.user.school.id },
      data: { waveNumber, omNumber, name, address, city, logoUrl: logoUrl || undefined },
    });
    req.user.school = school;
    await logAudit({ action: 'school_settings_update', entity: 'School', entityId: school.id, user: req.user, ip: req.ip });
    res.render('school/settings', { user: req.user, school, success: 'Paramètres mis à jour', error: null });
  } catch (err) {
    console.error(err);
    res.render('school/settings', { user: req.user, school: req.user.school, success: null, error: 'Erreur de mise à jour' });
  }
}

async function listClasses(req, res) {
  const classes = await prisma.class.findMany({
    where: { schoolId: req.user.school.id },
    include: { _count: { select: { students: true } } },
    orderBy: { name: 'asc' },
  });
  res.render('school/classes', {
    user: req.user,
    school: req.user.school,
    classes,
    error: req.query.error || null,
    success: req.query.success || null,
  });
}

async function createClass(req, res) {
  const { name, level, schoolYear } = req.body;
  const school = req.user.school;
  try {
    await prisma.class.create({
      data: {
        name,
        level,
        schoolYear: schoolYear || school.currentSchoolYear,
        schoolId: school.id,
      },
    });
    await logAudit({ action: 'class_create', entity: 'Class', user: req.user, ip: req.ip, details: { name } });
    res.redirect('/school/classes?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/school/classes?error=create');
  }
}

async function updateClass(req, res) {
  const { id } = req.params;
  const { name, level, schoolYear } = req.body;
  try {
    await prisma.class.updateMany({
      where: { id, schoolId: req.user.school.id },
      data: { name, level, schoolYear },
    });
    await logAudit({ action: 'class_update', entity: 'Class', entityId: id, user: req.user, ip: req.ip });
    res.redirect('/school/classes?success=updated');
  } catch (err) {
    console.error(err);
    res.redirect('/school/classes?error=update');
  }
}

async function deleteClass(req, res) {
  const { id } = req.params;
  try {
    const count = await prisma.student.count({ where: { classId: id } });
    if (count > 0) return res.redirect('/school/classes?error=has_students');
    await prisma.class.deleteMany({ where: { id, schoolId: req.user.school.id } });
    await logAudit({ action: 'class_delete', entity: 'Class', entityId: id, user: req.user, ip: req.ip });
    res.redirect('/school/classes?success=deleted');
  } catch (err) {
    console.error(err);
    res.redirect('/school/classes?error=delete');
  }
}

async function listStudents(req, res) {
  const schoolId = req.user.school.id;
  const students = await prisma.student.findMany({
    where: { schoolId },
    include: { class: true, parents: { include: { parent: { include: { user: true } } } } },
    orderBy: { lastName: 'asc' },
  });
  const classes = await prisma.class.findMany({ where: { schoolId } });
  res.render('school/students', {
    user: req.user,
    school: req.user.school,
    students,
    classes,
    error: req.query.error || null,
    success: req.query.success || null,
    importResult: null,
  });
}

async function downloadStudentImportTemplate(_req, res) {
  const { CSV_TEMPLATE } = require('../utils/csvStudents');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modele-import-eleves.csv"');
  res.send(CSV_TEMPLATE);
}

async function importStudents(req, res) {
  const schoolId = req.user.school.id;
  const classes = await prisma.class.findMany({ where: { schoolId } });

  const render = (importResult, error = null) => prisma.student.findMany({
    where: { schoolId },
    include: { class: true, parents: { include: { parent: { include: { user: true } } } } },
    orderBy: { lastName: 'asc' },
  }).then((students) => res.render('school/students', {
    user: req.user,
    school: req.user.school,
    students,
    classes,
    error,
    importResult,
  }));

  if (!req.file?.buffer) return render(null, 'Fichier CSV requis');

  try {
    const text = req.file.buffer.toString('utf-8');
    const { parseCsv, prepareStudentRows } = require('../utils/csvStudents');
    const { rows } = parseCsv(text);
    if (!rows.length) return render(null, 'Le fichier CSV est vide');

    const existing = await prisma.student.findMany({
      where: { schoolId, matricule: { not: null } },
      select: { matricule: true },
    });
    const existingMatricules = new Set(existing.map((s) => s.matricule.toLowerCase()));
    const { valid, errors } = prepareStudentRows(rows, classes, existingMatricules);

    if (valid.length) {
      await prisma.$transaction(
        valid.map((row) => prisma.student.create({
          data: {
            firstName: row.firstName,
            lastName: row.lastName,
            matricule: row.matricule,
            classId: row.classId,
            schoolId,
            birthDate: row.birthDate,
          },
        })),
      );
      await logAudit({
        action: 'students_import_csv',
        entity: 'Student',
        entityId: schoolId,
        user: req.user,
        ip: req.ip,
        details: { count: valid.length },
      });
    }

    return render({ imported: valid.length, skipped: errors.length, errors });
  } catch (err) {
    console.error(err);
    return render(null, 'Erreur lors de l\'import CSV');
  }
}

async function createStudent(req, res) {
  const { firstName, lastName, matricule, classId, birthDate } = req.body;
  const schoolId = req.user.school.id;
  try {
    const cls = await prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!cls) return res.redirect('/school/students?error=class');

    await prisma.student.create({
      data: {
        firstName,
        lastName,
        matricule: matricule || null,
        classId,
        schoolId,
        birthDate: birthDate ? new Date(birthDate) : null,
      },
    });
    await logAudit({ action: 'student_create', entity: 'Student', user: req.user, ip: req.ip, details: { matricule } });
    res.redirect('/school/students?success=1');
  } catch (err) {
    console.error(err);
    if (err.code === 'P2002') return res.redirect('/school/students?error=matricule');
    res.redirect('/school/students?error=1');
  }
}

async function updateStudent(req, res) {
  const { id } = req.params;
  const { firstName, lastName, matricule, classId, birthDate } = req.body;
  const schoolId = req.user.school.id;
  try {
    const cls = await prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!cls) return res.redirect('/school/students?error=class');

    await prisma.student.updateMany({
      where: { id, schoolId },
      data: {
        firstName,
        lastName,
        matricule: matricule || null,
        classId,
        birthDate: birthDate ? new Date(birthDate) : null,
      },
    });
    await logAudit({ action: 'student_update', entity: 'Student', entityId: id, user: req.user, ip: req.ip });
    res.redirect('/school/students?success=updated');
  } catch (err) {
    console.error(err);
    res.redirect('/school/students?error=update');
  }
}

async function deleteStudent(req, res) {
  const { id } = req.params;
  try {
    await prisma.student.deleteMany({ where: { id, schoolId: req.user.school.id } });
    await logAudit({ action: 'student_delete', entity: 'Student', entityId: id, user: req.user, ip: req.ip });
    res.redirect('/school/students?success=deleted');
  } catch (err) {
    console.error(err);
    res.redirect('/school/students?error=delete');
  }
}

async function listPayments(req, res) {
  const payments = await prisma.payment.findMany({
    where: { student: { schoolId: req.user.school.id } },
    include: { student: { include: { class: true } }, feeType: true },
    orderBy: { createdAt: 'desc' },
  });
  res.render('school/payments', { user: req.user, school: req.user.school, payments });
}

async function validatePayment(req, res) {
  const { id } = req.params;
  const { action } = req.body;

  const payment = await prisma.payment.findFirst({
    where: { id, student: { schoolId: req.user.school.id } },
    include: { student: { include: { class: true } }, feeType: true },
  });

  if (!payment) return res.redirect('/school/payments');

  const status = action === 'validate' ? 'VALIDATED' : 'REJECTED';
  let receiptUrl = payment.receiptUrl;

  if (status === 'VALIDATED') {
    const { generateReceiptPdf } = require('../services/documentPdf');
    const { pdfUrl } = await generateReceiptPdf({
      payment: { ...payment, status, validatedAt: new Date() },
      student: payment.student,
      school: req.user.school,
      feeType: payment.feeType,
    });
    receiptUrl = pdfUrl;
  }

  await prisma.payment.update({
    where: { id },
    data: { status, validatedAt: new Date(), receiptUrl },
  });

  await logAudit({
    action: `payment_${status.toLowerCase()}`,
    entity: 'Payment',
    entityId: id,
    user: req.user,
    ip: req.ip,
  });

  if (status === 'VALIDATED') {
    const parents = await prisma.parentStudent.findMany({
      where: { studentId: payment.studentId },
      include: { parent: { include: { user: true } } },
    });
    const { notifyUser } = require('../utils/notify');
    for (const ps of parents) {
      await notifyUser(ps.parent.userId, {
        type: 'PAYMENT',
        title: 'Paiement validé',
        body: `${payment.amount.toLocaleString('fr-FR')} FCFA confirmés. Reçu disponible.`,
        sms: true,
      });
    }

    const { isEnabled, getModuleMap, initFinanceDefaults } = require('../utils/modules');
    const mods = await getModuleMap(req.user.school.id);
    if (isEnabled(mods, 'accounting')) {
      await initFinanceDefaults(req.user.school.id);
      const waveAccount = await prisma.financeAccount.findFirst({
        where: { schoolId: req.user.school.id, type: 'WAVE' },
      });
      if (waveAccount) {
        await prisma.$transaction(async (tx) => {
          await tx.financeTransaction.create({
            data: {
              schoolId: req.user.school.id,
              type: 'INCOME',
              amount: payment.amount,
              accountId: waveAccount.id,
              description: `Paiement ${payment.student.firstName} ${payment.student.lastName}`,
              reference: payment.reference,
              paymentId: payment.id,
            },
          });
          await tx.financeAccount.update({
            where: { id: waveAccount.id },
            data: { balance: { increment: payment.amount } },
          });
        });
      }
    }
  }

  res.redirect('/school/payments');
}

async function listBulletins(req, res) {
  const schoolId = req.user.school.id;
  const [students, classes] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId },
      include: { class: true, bulletins: { orderBy: { generatedAt: 'desc' } } },
      orderBy: [{ class: { name: 'asc' } }, { lastName: 'asc' }],
    }),
    prisma.class.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
  ]);

  res.render('school/bulletins', {
    user: req.user,
    school: req.user.school,
    students,
    classes,
    success: req.query.success || null,
    error: req.query.error || null,
    bulkResult: req.query.bulk ? JSON.parse(decodeURIComponent(req.query.bulk)) : null,
  });
}

async function generateBulletin(req, res) {
  const { studentId, period } = req.body;
  try {
    const result = await generateBulletinForStudent({
      studentId,
      period,
      school: req.user.school,
    });
    if (result.error) return res.redirect(`/school/bulletins?error=${result.error}`);
    await logAudit({ action: 'bulletin_generate', entity: 'Bulletin', entityId: studentId, user: req.user, ip: req.ip });
    res.redirect('/school/bulletins?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/school/bulletins?error=generation');
  }
}

async function generateBulkBulletin(req, res) {
  const { classId, period } = req.body;
  try {
    const results = await generateBulkBulletins({
      classId,
      period,
      schoolId: req.user.school.id,
      school: req.user.school,
    });
    await logAudit({
      action: 'bulletin_bulk_generate',
      entity: 'Bulletin',
      user: req.user,
      ip: req.ip,
      details: results,
    });
    res.redirect(`/school/bulletins?bulk=${encodeURIComponent(JSON.stringify(results))}`);
  } catch (err) {
    console.error(err);
    res.redirect('/school/bulletins?error=generation');
  }
}

async function listTeachers(req, res) {
  const schoolId = req.user.school.id;
  const [teachers, classes] = await Promise.all([
    prisma.teacher.findMany({
      where: { schoolId },
      include: { user: true, classes: { include: { class: true } } },
    }),
    prisma.class.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
  ]);

  res.render('school/teachers', {
    user: req.user,
    school: req.user.school,
    teachers,
    classes,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function inviteTeacher(req, res) {
  const { email, firstName, lastName, phone, subject, password } = req.body;
  const schoolId = req.user.school.id;
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.redirect('/school/teachers?error=email');

    const tempPassword = password || `Edu${Math.random().toString(36).slice(2, 10)}`;
    const hashed = await hashPassword(tempPassword);

    await prisma.user.create({
      data: {
        email,
        password: hashed,
        firstName,
        lastName,
        phone,
        role: 'TEACHER',
        teacher: { create: { schoolId, subject } },
      },
    });

    await logAudit({
      action: 'teacher_invite',
      entity: 'Teacher',
      user: req.user,
      ip: req.ip,
      details: { email, subject },
    });

    res.redirect('/school/teachers?success=invited');
  } catch (err) {
    console.error(err);
    res.redirect('/school/teachers?error=invite');
  }
}

async function assignTeacherClass(req, res) {
  const { teacherId } = req.params;
  const { classId } = req.body;

  try {
    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, schoolId: req.user.school.id },
    });
    if (!teacher) return res.redirect('/school/teachers?error=1');

    await prisma.teacherClass.upsert({
      where: { teacherId_classId: { teacherId, classId } },
      create: { teacherId, classId },
      update: {},
    });

    res.redirect('/school/teachers?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/school/teachers?error=1');
  }
}

async function schoolYearPage(req, res) {
  const school = req.user.school;
  const classes = await prisma.class.findMany({
    where: { schoolId: school.id },
    include: { _count: { select: { students: true } } },
    orderBy: { level: 'asc' },
  });

  res.render('school/school-year', {
    user: req.user,
    school,
    classes,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function updateSchoolYear(req, res) {
  const { currentSchoolYear } = req.body;
  try {
    await prisma.school.update({
      where: { id: req.user.school.id },
      data: { currentSchoolYear },
    });
    await prisma.class.updateMany({
      where: { schoolId: req.user.school.id },
      data: { schoolYear: currentSchoolYear },
    });
    req.user.school.currentSchoolYear = currentSchoolYear;
    res.redirect('/school/school-year?success=year');
  } catch (err) {
    console.error(err);
    res.redirect('/school/school-year?error=1');
  }
}

const LEVEL_ORDER = ['PS', 'MS', 'GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e'];

async function promoteClass(req, res) {
  const { classId, targetClassId } = req.body;
  const schoolId = req.user.school.id;

  try {
    const source = await prisma.class.findFirst({ where: { id: classId, schoolId } });
    const target = await prisma.class.findFirst({ where: { id: targetClassId, schoolId } });
    if (!source || !target) return res.redirect('/school/school-year?error=class');

    const updated = await prisma.student.updateMany({
      where: { classId: source.id, schoolId },
      data: { classId: target.id },
    });

    await logAudit({
      action: 'class_promotion',
      entity: 'Class',
      entityId: classId,
      user: req.user,
      ip: req.ip,
      details: { from: source.name, to: target.name, count: updated.count },
    });

    res.redirect(`/school/school-year?success=promoted&count=${updated.count}`);
  } catch (err) {
    console.error(err);
    res.redirect('/school/school-year?error=promote');
  }
}

async function upgradeSubscription(req, res) {
  await prisma.school.update({
    where: { id: req.user.school.id },
    data: { subscription: 'premium' },
  });
  res.redirect('/school/dashboard?premium=1');
}

async function modulesPage(req, res) {
  const { getModuleMap } = require('../utils/modules');
  const { MODULE_KEYS } = require('../config/modules');
  const modules = await getModuleMap(req.user.school.id);
  res.render('school/modules', {
    user: req.user,
    school: req.user.school,
    modules,
    MODULE_KEYS,
    success: req.query.success || null,
  });
}

async function updateModules(req, res) {
  const { MODULE_KEYS } = require('../config/modules');
  const { setModule, getModuleMap } = require('../utils/modules');
  const current = await getModuleMap(req.user.school.id);

  for (const key of MODULE_KEYS) {
    if (current[key]?.locked) continue;
    const enabled = req.body[`mod_${key}`] === 'on';
    await setModule(req.user.school.id, key, { enabled });
  }
  res.redirect('/school/modules?success=1');
}

module.exports = {
  dashboard,
  settings,
  updateSettings,
  listClasses,
  createClass,
  updateClass,
  deleteClass,
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  downloadStudentImportTemplate,
  importStudents,
  listPayments,
  validatePayment,
  listBulletins,
  generateBulletin,
  generateBulkBulletin,
  listTeachers,
  inviteTeacher,
  assignTeacherClass,
  schoolYearPage,
  updateSchoolYear,
  promoteClass,
  upgradeSubscription,
  modulesPage,
  updateModules,
  LEVEL_ORDER,
};
