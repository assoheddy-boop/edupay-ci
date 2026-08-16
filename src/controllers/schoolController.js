const prisma = require('../config/database');
const { logAudit } = require('../utils/audit');
const { generateBulletinForStudent, generateBulkBulletins } = require('../services/bulletinService');
const { getPendingPayments } = require('../../services/PaymentService');
const { generateBulletinPDF } = require('../../services/export');
const { parseGender } = require('../../services/ClassService');
const { applyClass, applyStudent, applyTeacher } = require('../services/offlineActions');
const {
  getSchoolGenderStats,
  getAbsenceStatsByGender,
  getSuccessRateByGender,
} = require('../../services/StatsService');
const { getReinscriptionStats } = require('../../services/ReinscriptionService');

async function dashboard(req, res) {
  const school = req.user.school;
  if (!school) return res.redirect('/auth/login');

  const schoolYear = school.currentSchoolYear;

  const [
    classes,
    students,
    teachers,
    pendingList,
    recentPayments,
    gender,
    absenceByGender,
    successByGender,
    reinscription,
  ] = await Promise.all([
    prisma.class.count({ where: { schoolId: school.id } }),
    prisma.student.count({ where: { schoolId: school.id } }),
    prisma.teacher.count({ where: { schoolId: school.id } }),
    getPendingPayments(school.id),
    prisma.payment.findMany({
      where: { student: { schoolId: school.id } },
      include: { student: true, feeType: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    getSchoolGenderStats(school.id),
    getAbsenceStatsByGender({ schoolId: school.id }),
    getSuccessRateByGender({ schoolId: school.id }),
    getReinscriptionStats(school.id, schoolYear),
  ]);

  res.render('school/dashboard', {
    user: req.user,
    school,
    stats: { classes, students, teachers, pendingPayments: pendingList.length },
    recentPayments,
    analyse: { gender, absenceByGender, successByGender, reinscription, schoolYear },
  });
}

async function settings(req, res) {
  const success = req.query.success === 'photo' ? 'Photo de profil mise à jour' : null;
  res.render('school/settings', { user: req.user, school: req.user.school, success, error: null });
}

async function updateSettings(req, res) {
  const { waveNumber, omNumber, name, address, city, removeLogo } = req.body;
  try {
    const data = { waveNumber, omNumber, name, address, city };

    if (removeLogo === 'on') {
      const { removeSchoolLogoFiles } = require('../utils/schoolLogo');
      removeSchoolLogoFiles(req.user.school.id);
      data.logoUrl = null;
      data.logoBase64 = null;
    }

    if (req.file) {
      const { saveSchoolLogo } = require('../utils/schoolLogo');
      const logo = await saveSchoolLogo(req.user.school.id, req.file);
      data.logoUrl = logo.logoUrl;
      data.logoBase64 = logo.logoBase64;
    }

    const school = await prisma.school.update({
      where: { id: req.user.school.id },
      data,
    });
    req.user.school = school;
    await logAudit({ action: 'school_settings_update', entity: 'School', entityId: school.id, user: req.user, ip: req.ip });
    res.render('school/settings', { user: req.user, school, success: 'Paramètres mis à jour', error: null });
  } catch (err) {
    console.error(err);
    const message = err.message?.includes('Format') ? err.message : 'Erreur de mise à jour';
    res.render('school/settings', { user: req.user, school: req.user.school, success: null, error: message });
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
  try {
    const result = await applyClass({ user: req.user, payload: req.body });
    if (!result.ok) return res.redirect('/school/classes?error=create');
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
            gender: parseGender(row.gender),
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
  try {
    const result = await applyStudent({ user: req.user, payload: req.body, file: req.file || null });
    if (!result.ok) {
      if (result.error === 'class') return res.redirect('/school/students?error=class');
      if (result.error === 'matricule') return res.redirect('/school/students?error=matricule');
      return res.redirect('/school/students?error=1');
    }
    res.redirect('/school/students?success=1');
  } catch (err) {
    console.error(err);
    if (err.code === 'P2002') return res.redirect('/school/students?error=matricule');
    res.redirect('/school/students?error=1');
  }
}

async function updateStudent(req, res) {
  const { id } = req.params;
  const { firstName, lastName, matricule, classId, birthDate, gender } = req.body;
  const schoolId = req.user.school.id;
  try {
    const cls = await prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!cls) return res.redirect('/school/students?error=class');

    const data = {
      firstName,
      lastName,
      matricule: matricule || null,
      classId,
      birthDate: birthDate ? new Date(birthDate) : null,
      gender: parseGender(gender),
    };
    if (req.body.removePhoto === 'on') {
      const { removePersonPhoto } = require('../utils/media');
      removePersonPhoto('student', id);
      data.photoUrl = null;
    }
    if (req.file) {
      const { savePersonPhoto } = require('../utils/media');
      data.photoUrl = (await savePersonPhoto('student', id, req.file)).photoUrl;
    }

    await prisma.student.updateMany({
      where: { id, schoolId },
      data,
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
  const schoolId = req.user.school.id;
  const pending = await getPendingPayments(schoolId);
  const others = await prisma.payment.findMany({
    where: { student: { schoolId }, status: { not: 'PENDING' } },
    include: { student: { include: { class: true } }, feeType: true, proofs: true },
    orderBy: { createdAt: 'desc' },
  });
  const payments = [...pending, ...others];
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
    const { delCache } = require('../../services/cache');
    await delCache(`stats:school:${req.user.school.id}`);

    const parents = await prisma.parentStudent.findMany({
      where: { studentId: payment.studentId },
      include: { parent: { include: { user: true } } },
    });
    const { sendNotification } = require('../../services/NotificationService');
    for (const ps of parents) {
      await sendNotification(
        ps.parent.userId,
        'payment_validated',
        `${payment.amount.toLocaleString('fr-FR')} FCFA confirmés pour ${payment.student.firstName}. Reçu disponible.`,
      );
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

async function exportBulletinPdf(req, res) {
  const student = await prisma.student.findFirst({
    where: { id: req.params.studentId, schoolId: req.user.school.id },
  });
  if (!student) return res.redirect('/school/bulletins?error=eleve');

  try {
    const result = await generateBulletinPDF(student.id);
    if (!result.ok) return res.redirect(`/school/bulletins?error=${result.error}`);
    return res.download(result.filepath, result.filename);
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
  try {
    const result = await applyTeacher({ user: req.user, payload: req.body, file: req.file || null });
    if (!result.ok) {
      const code = result.error === 'conflict' ? (result.existing?.field || 'email') : (result.error || 'invite');
      return res.redirect(`/school/teachers?error=${code}`);
    }
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

async function updateTeacherPhoto(req, res) {
  const { teacherId } = req.params;
  const teacher = await prisma.teacher.findFirst({
    where: { id: teacherId, schoolId: req.user.school.id },
  });
  if (!teacher) return res.redirect('/school/teachers?error=1');

  try {
    if (req.body.removePhoto === 'on') {
      const { removePersonPhoto } = require('../utils/media');
      removePersonPhoto('user', teacher.userId);
      await prisma.user.update({ where: { id: teacher.userId }, data: { photoUrl: null } });
    } else if (req.file) {
      const { savePersonPhoto } = require('../utils/media');
      const { photoUrl } = await savePersonPhoto('user', teacher.userId, req.file);
      await prisma.user.update({ where: { id: teacher.userId }, data: { photoUrl } });
    }
    res.redirect('/school/teachers?success=photo');
  } catch (err) {
    console.error(err);
    res.redirect('/school/teachers?error=photo');
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
  exportBulletinPdf,
  listTeachers,
  inviteTeacher,
  assignTeacherClass,
  updateTeacherPhoto,
  schoolYearPage,
  updateSchoolYear,
  promoteClass,
  LEVEL_ORDER,
};
