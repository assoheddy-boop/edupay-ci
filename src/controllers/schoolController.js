const prisma = require('../config/database');
const { sendNotification } = require('../../services/NotificationService');
const { formatMoney } = require('../middleware/currency');
const { logAudit } = require('../utils/audit');
const {
  SMS_OFFICIAL_MODULE,
  sanitizeSmsSenderId,
  smsPreviewExample,
  canAccessSchoolJobs,
} = require('../utils/officialSms');
const { MARKETPLACE_MODULE } = require('../utils/marketplaceAddon');
const { getModuleMap, isEnabled } = require('../utils/modules');
const { bypassPlanAndModules } = require('../utils/adminAssist');
const { parseEducationCycle } = require('../utils/educationCycle');
const {
  parsePublicPortalFields,
  savePortalImage,
  PUBLIC_TYPE_OPTIONS,
  MAX_GALLERY,
} = require('../utils/publicPortal');
const { generateBulletinForStudent, generateBulkBulletins, streamBulletinPdf } = require('../services/bulletinService');
const { BULLETIN_TERMS, formatTermLabel } = require('../services/academicTerms');
const {
  COLLEGE_CI_SUBJECTS,
  parseCoefficient,
  defaultCoefficientFor,
  upsertSubjectCoefficient,
} = require('../services/gradesAverage');
const { getPendingPayments } = require('../../services/PaymentService');
const {
  CAISSE_METHODS,
  newIdempotencyKey,
  methodLabel,
  searchStudents,
  getStudentForSchool,
  listTodayTill,
  createCaissePayment,
  getCaisseTicket,
} = require('../services/caisseService');
const {
  getStudentFeeBalance,
  mapActiveCasesByStudent,
  motifLabel,
  discountLabel,
} = require('../services/socialCaseService');
const { generateBulletinPDF, generateHomeworkCalendarPDF, generateHomeworkCalendarExcel } = require('../../services/export');
const { sendPdfDownload } = require('../utils/pdfOutput');
const { sendExcel } = require('../services/exportExcel');
const { summarizeHomeworkStats, calendarEventsJson } = require('../services/homeworkService');
const { parseGender } = require('../../services/ClassService');
const { parseSeries } = require('../services/series');
const { applyClass, applyStudent, applyTeacher } = require('../services/offlineActions');
const {
  normalizeNationalMatricule,
  uniqueStudentError,
  assertNationalMatriculeAvailable,
} = require('../utils/nationalMatricule');
const { importStudentsFromFile } = require('../services/studentImport');
const { loadRoleDashboard } = require('../services/dashboardService');
const { attachStaffContext, resolveStaffSchoolId } = require('../utils/staffPermissions');
const { createStudentUserAccount } = require('../utils/studentAccount');

async function dashboard(req, res) {
  const school = req.user.school;
  if (!school) return res.redirect('/auth/login');

  const schoolYear = school.currentSchoolYear;
  const staffCtx = attachStaffContext(req.user, resolveStaffSchoolId(req.user));
  const staffRole = staffCtx.staffRole || 'DIRECTOR';

  const [classes, students, teachers, recentPayments, roleDashboard] = await Promise.all([
    prisma.class.count({ where: { schoolId: school.id } }),
    prisma.student.count({ where: { schoolId: school.id } }),
    prisma.teacher.count({ where: { schoolId: school.id } }),
    prisma.payment.findMany({
      where: { student: { schoolId: school.id } },
      include: { student: true, feeType: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    loadRoleDashboard(staffRole, school, schoolYear),
  ]);

  const widgets = roleDashboard.widgets || {};

  res.render('school/dashboard', {
    user: req.user,
    school,
    staffRole,
    staffRoleLabel: staffCtx.staffRoleLabel,
    staffCan: staffCtx.staffCan,
    stats: {
      classes,
      students,
      teachers,
      pendingPayments: widgets.pendingPayments ?? 0,
    },
    recentPayments: ['DIRECTOR', 'ACCOUNTANT'].includes(staffRole) ? recentPayments : [],
    analyse: widgets.analyse || null,
    riskWidget: widgets.riskWidget || null,
    roleWidgets: widgets,
  });
}

function firstUploaded(req, field) {
  if (req.file && field === 'logo') return req.file;
  const files = req.files;
  if (!files) return null;
  if (Array.isArray(files)) return files.find((f) => f.fieldname === field) || null;
  const list = files[field];
  return Array.isArray(list) ? list[0] || null : list || null;
}

function uploadedList(req, field) {
  const files = req.files;
  if (!files) return [];
  if (Array.isArray(files)) return files.filter((f) => f.fieldname === field);
  const list = files[field];
  return Array.isArray(list) ? list : list ? [list] : [];
}

function settingsPageLocals(req, { school, success, error, smsOfficialEnabled, smsPreview, marketplaceEnabled } = {}) {
  return {
    user: req.user,
    school: school || req.user.school,
    success: success || null,
    error: error || null,
    smsOfficialEnabled,
    smsPreview,
    marketplaceEnabled: Boolean(marketplaceEnabled),
    canSetFeatured: req.user?.role === 'SUPER_ADMIN',
    publicTypeOptions: PUBLIC_TYPE_OPTIONS,
  };
}

async function settings(req, res) {
  const success = req.query.success === 'photo' ? 'Photo de profil mise à jour' : null;
  const mods = await getModuleMap(req.user.school.id);
  res.render('school/settings', settingsPageLocals(req, {
    success,
    smsOfficialEnabled: isEnabled(mods, SMS_OFFICIAL_MODULE),
    marketplaceEnabled: isEnabled(mods, MARKETPLACE_MODULE),
    smsPreview: smsPreviewExample(req.user.school.name),
  }));
}

async function coefficientsPage(req, res) {
  const schoolId = req.user.school.id;
  await syncSubjectsFromGrades(schoolId);
  const subjects = await prisma.subject.findMany({
    where: { schoolId },
    orderBy: { name: 'asc' },
  });
  res.render('school/coefficients', {
    user: req.user,
    school: req.user.school,
    subjects,
    collegeDefaults: COLLEGE_CI_SUBJECTS,
    defaultCoefficientFor,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function syncSubjectsFromGrades(schoolId) {
  const existing = await prisma.subject.findMany({
    where: { schoolId },
    select: { name: true },
  });
  const known = new Set(existing.map((s) => s.name));
  const grades = await prisma.grade.findMany({
    where: { student: { schoolId } },
    select: { subject: true },
    distinct: ['subject'],
  });
  for (const row of grades) {
    const name = String(row.subject || '').trim();
    if (!name || known.has(name)) continue;
    await upsertSubjectCoefficient(schoolId, name);
    known.add(name);
  }
}

async function updateCoefficients(req, res) {
  const schoolId = req.user.school.id;
  try {
    if (req.body.applyDefaults === '1') {
      for (const row of COLLEGE_CI_SUBJECTS) {
        await prisma.subject.upsert({
          where: { schoolId_name: { schoolId, name: row.name } },
          create: { schoolId, name: row.name, coefficient: row.coefficient },
          update: { coefficient: row.coefficient },
        });
      }
      await logAudit({
        action: 'coefficients_defaults',
        entity: 'Subject',
        user: req.user,
        ip: req.ip,
      });
      return res.redirect('/school/coefficients?success=defaults');
    }

    const ids = [].concat(req.body.subjectId || []);
    for (const id of ids) {
      const raw = req.body[`coefficient_${id}`];
      const coefficient = parseCoefficient(raw);
      if (coefficient == null) continue;
      await prisma.subject.updateMany({
        where: { id, schoolId },
        data: { coefficient },
      });
    }

    const newName = String(req.body.newName || '').trim();
    const newCoeff = parseCoefficient(req.body.newCoefficient);
    if (newName) {
      await upsertSubjectCoefficient(schoolId, newName, newCoeff != null ? newCoeff : defaultCoefficientFor(newName));
    }

    await logAudit({ action: 'coefficients_update', entity: 'Subject', user: req.user, ip: req.ip });
    res.redirect('/school/coefficients?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/school/coefficients?error=1');
  }
}

async function updateSettings(req, res) {
  const { waveNumber, omNumber, name, address, city, removeLogo, smsSenderId, educationCycle } = req.body;
  try {
    const mods = await getModuleMap(req.user.school.id);
    const marketplaceEnabled = isEnabled(mods, MARKETPLACE_MODULE);
    const portal = parsePublicPortalFields(req.body, { user: req.user });
    const data = {
      waveNumber,
      omNumber,
      name,
      address,
      city,
    };
    if (marketplaceEnabled) {
      data.publicPortalEnabled = portal.publicPortalEnabled;
      data.publicDescription = portal.publicDescription;
      data.publicLife = portal.publicLife;
      data.publicPhone = portal.publicPhone;
      data.publicType = portal.publicType;
      data.lat = portal.lat;
      data.lng = portal.lng;
      if (portal.publicFeatured != null) {
        data.publicFeatured = portal.publicFeatured;
      }
    }
    if (data.publicPortalEnabled && !req.user.school.slug) {
      throw new Error('Attribuez un code école (slug) avant de publier la page publique.');
    }
    if (educationCycle != null && String(educationCycle).trim() !== '') {
      data.educationCycle = parseEducationCycle(educationCycle);
    }
    if (smsSenderId !== undefined) {
      data.smsSenderId = sanitizeSmsSenderId(smsSenderId);
    }

    if (removeLogo === 'on') {
      const { removeSchoolLogoFiles } = require('../utils/schoolLogo');
      removeSchoolLogoFiles(req.user.school.id);
      data.logoUrl = null;
      data.logoBase64 = null;
    }

    const logoFile = firstUploaded(req, 'logo');
    if (logoFile) {
      const { saveSchoolLogo } = require('../utils/schoolLogo');
      const logo = await saveSchoolLogo(req.user.school.id, logoFile);
      data.logoUrl = logo.logoUrl;
      data.logoBase64 = logo.logoBase64;
    }

    if (marketplaceEnabled) {
      if (req.body.removeBanner === 'on') {
        data.publicBanner = null;
      } else {
        const bannerFile = firstUploaded(req, 'banner');
        if (bannerFile) {
          const bannerUrl = await savePortalImage(bannerFile);
          if (bannerUrl) data.publicBanner = bannerUrl;
        } else if (portal.publicBanner) {
          data.publicBanner = portal.publicBanner;
        }
      }

      const gallery = [...(portal.publicGallery || [])];
      for (const file of uploadedList(req, 'gallery')) {
        const url = await savePortalImage(file);
        if (url) gallery.push(url);
      }
      data.publicGallery = gallery.slice(0, MAX_GALLERY);
    }

    const school = await prisma.school.update({
      where: { id: req.user.school.id },
      data,
    });
    req.user.school = school;
    await logAudit({ action: 'school_settings_update', entity: 'School', entityId: school.id, user: req.user, ip: req.ip });
    res.render('school/settings', settingsPageLocals(req, {
      school,
      success: 'Paramètres mis à jour',
      smsOfficialEnabled: isEnabled(mods, SMS_OFFICIAL_MODULE),
      marketplaceEnabled,
      smsPreview: smsPreviewExample(school.name),
    }));
  } catch (err) {
    console.error(err);
    const message = (err.message?.includes('Format') || err.message?.includes('slug'))
      ? err.message
      : 'Erreur de mise à jour';
    const errorMods = await getModuleMap(req.user.school.id);
    res.render('school/settings', settingsPageLocals(req, {
      error: message,
      smsOfficialEnabled: isEnabled(errorMods, SMS_OFFICIAL_MODULE),
      marketplaceEnabled: isEnabled(errorMods, MARKETPLACE_MODULE),
      smsPreview: smsPreviewExample(req.user.school.name),
    }));
  }
}

function parseSmsDate(value, endOfDay) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date;
}

async function smsDashboard(req, res) {
  const school = req.user.school;
  if (!school?.id) return res.status(403).render('error', { message: 'Accès refusé', user: req.user });

  const requestedSchoolId = req.query.schoolId || school.id;
  if (!canAccessSchoolJobs(req.user, requestedSchoolId)) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  const mods = await getModuleMap(school.id);
  if (!isEnabled(mods, SMS_OFFICIAL_MODULE) && !bypassPlanAndModules(req.user)) {
    return res.status(403).render('school/module-disabled', {
      user: req.user,
      moduleKey: SMS_OFFICIAL_MODULE,
      moduleLabel: 'SMS officiel',
      school,
    });
  }

  const channel = req.query.channel || 'SMS';
  const status = req.query.status || '';
  const from = parseSmsDate(req.query.from, false);
  const to = parseSmsDate(req.query.to, true);

  const where = { schoolId: school.id };
  if (channel && channel !== 'all') where.channel = channel;
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) where.createdAt.lte = to;
  }

  const jobs = await prisma.notificationJob.findMany({
    where,
    include: { user: { select: { firstName: true, lastName: true, phone: true } } },
    orderBy: { createdAt: 'desc' },
    take: 150,
  });

  const wantsJson = req.query.format === 'json' || req.headers.accept?.includes('application/json');
  if (wantsJson) {
    return res.json({
      ok: true,
      schoolId: school.id,
      count: jobs.length,
      jobs: jobs.map((job) => ({
        id: job.id,
        channel: job.channel,
        eventType: job.eventType,
        status: job.status,
        senderId: job.senderId,
        error: job.error,
        createdAt: job.createdAt,
        sentAt: job.sentAt,
      })),
    });
  }

  res.render('school/sms', {
    user: req.user,
    school,
    jobs,
    filters: {
      channel,
      status,
      from: req.query.from || '',
      to: req.query.to || '',
    },
    smsPreview: smsPreviewExample(school.name),
  });
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
  const { name, level, schoolYear, series } = req.body;
  try {
    await prisma.class.updateMany({
      where: { id, schoolId: req.user.school.id },
      data: { name, level, schoolYear, series: parseSeries(series) },
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

function schoolOr403(req, res) {
  const school = req.user?.school;
  if (!school?.id) {
    res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    return null;
  }
  const requested = String(req.body?.schoolId || req.query?.schoolId || '').trim();
  if (requested && requested !== school.id) {
    res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    return null;
  }
  return school;
}

async function downloadStudentImportTemplate(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const format = String(req.query.format || '').toLowerCase();
  if (format === 'xlsx' || format === 'excel') {
    const { buildExcelTemplate } = require('../utils/csvStudents');
    const wb = await buildExcelTemplate();
    return sendExcel(res, 'modele-import-eleves.xlsx', wb);
  }

  const { CSV_TEMPLATE } = require('../utils/csvStudents');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modele-import-eleves.csv"');
  res.send(CSV_TEMPLATE);
}

async function importStudents(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const result = await importStudentsFromFile({
    schoolId: school.id,
    file: req.file,
    user: req.user,
    ip: req.ip,
  });

  if (result.status === 403) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  const [classes, students] = await Promise.all([
    prisma.class.findMany({ where: { schoolId: school.id } }),
    prisma.student.findMany({
      where: { schoolId: school.id },
      include: { class: true, parents: { include: { parent: { include: { user: true } } } } },
      orderBy: { lastName: 'asc' },
    }),
  ]);

  const locals = {
    user: req.user,
    school,
    students,
    classes,
    success: null,
  };

  if (!result.ok) {
    return res.status(result.status || 400).render('school/students', {
      ...locals,
      error: result.message || 'Erreur lors de l\'import',
      importResult: null,
    });
  }

  return res.render('school/students', {
    ...locals,
    error: null,
    importResult: {
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
    },
  });
}

async function createStudent(req, res) {
  try {
    const result = await applyStudent({ user: req.user, payload: req.body, file: req.file || null });
    if (!result.ok) {
      if (result.error === 'class') return res.redirect('/school/students?error=class');
      if (result.error === 'matricule') return res.redirect('/school/students?error=matricule');
      if (result.error === 'nationalMatricule') return res.redirect('/school/students?error=nationalMatricule');
      return res.redirect('/school/students?error=1');
    }
    res.redirect('/school/students?success=1');
  } catch (err) {
    console.error(err);
    const uniqueErr = uniqueStudentError(err);
    if (uniqueErr) return res.redirect(`/school/students?error=${uniqueErr}`);
    res.redirect('/school/students?error=1');
  }
}

async function updateStudent(req, res) {
  const { id } = req.params;
  const { firstName, lastName, matricule, classId, birthDate, gender, series } = req.body;
  const schoolId = req.user.school.id;
  try {
    const cls = await prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!cls) return res.redirect('/school/students?error=class');

    const nationalMatricule = normalizeNationalMatricule(req.body.nationalMatricule);
    const uniqueNat = await assertNationalMatriculeAvailable({
      prisma,
      schoolId,
      nationalMatricule,
      excludeId: id,
    });
    if (!uniqueNat.ok) return res.redirect('/school/students?error=nationalMatricule');

    const data = {
      firstName,
      lastName,
      matricule: matricule || null,
      nationalMatricule,
      classId,
      birthDate: birthDate ? new Date(birthDate) : null,
      gender: parseGender(gender),
      series: parseSeries(series),
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
    const uniqueErr = uniqueStudentError(err);
    if (uniqueErr) return res.redirect(`/school/students?error=${uniqueErr}`);
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
  const socialCases = await mapActiveCasesByStudent(
    schoolId,
    payments.map((p) => p.studentId || p.student?.id),
  );
  res.render('school/payments', {
    user: req.user,
    school: req.user.school,
    payments,
    socialCases,
    motifLabel,
    discountLabel,
  });
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

    const { isEnabled, getModuleMap, initFinanceDefaults } = require('../utils/modules');
    const mods = await getModuleMap(req.user.school.id);
    if (isEnabled(mods, 'accounting')) {
      await initFinanceDefaults(req.user.school.id);
      const { recordValidatedPayment } = require('../../services/AccountingService');
      await recordValidatedPayment({
        schoolId: req.user.school.id,
        payment,
      });
    }
  }

  const parents = await prisma.parentStudent.findMany({
    where: { studentId: payment.studentId },
    include: { parent: { include: { user: true } } },
  });
  const amountLabel = formatMoney(payment.amount);
  const kind = status === 'VALIDATED' ? 'payment_validated' : 'payment_refused';
  const message = status === 'VALIDATED'
    ? `${amountLabel} confirmés pour ${payment.student.firstName}. Reçu disponible.`
    : `Paiement de ${amountLabel} refusé pour ${payment.student.firstName}. Vérifiez la preuve ou contactez l'école.`;
  for (const ps of parents) {
    await sendNotification(ps.parent.userId, kind, message, { schoolId: req.user.school.id });
  }

  res.redirect('/school/payments');
}

async function caissePage(req, res) {
  const school = req.user.school;
  if (!school?.id) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  const q = String(req.query.q || '').trim();
  const studentId = String(req.query.studentId || '').trim();
  const [feeTypes, matches, selectedStudent, till] = await Promise.all([
    prisma.feeType.findMany({
      where: { schoolId: school.id, isActive: true },
      orderBy: { name: 'asc' },
    }),
    searchStudents(school.id, q),
    studentId ? getStudentForSchool(school.id, studentId) : Promise.resolve(null),
    listTodayTill(school.id),
  ]);

  let feeBalance = null;
  if (selectedStudent) {
    feeBalance = await getStudentFeeBalance({
      schoolId: school.id,
      studentId: selectedStudent.id,
    });
    if (feeBalance.status === 403) {
      return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    }
  }

  const dueByFee = {};
  if (feeBalance?.ok) {
    for (const line of feeBalance.lines) dueByFee[line.feeTypeId] = line;
  }

  res.render('school/caisse', {
    user: req.user,
    school,
    q,
    feeTypes,
    matches,
    selectedStudent,
    feeBalance: feeBalance?.ok ? feeBalance : null,
    dueByFee,
    motifLabel,
    discountLabel,
    tillPayments: till.payments,
    tillTotals: till.totals,
    methods: CAISSE_METHODS,
    methodLabel,
    idempotencyKey: newIdempotencyKey(),
    error: req.query.error || null,
    success: req.query.success || null,
  });
}

async function createCaisseEntry(req, res) {
  const school = req.user.school;
  if (!school?.id) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  const result = await createCaissePayment({ school, body: req.body || {} });
  if (result.status === 403 || result.error === 'forbidden') {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }
  if (!result.ok) {
    const studentQs = req.body?.studentId ? `&studentId=${encodeURIComponent(req.body.studentId)}` : '';
    return res.redirect(`/school/caisse?error=${result.error || 'data'}${studentQs}`);
  }

  await logAudit({
    action: result.duplicate ? 'caisse_duplicate' : 'caisse_encaisser',
    entity: 'Payment',
    entityId: result.payment.id,
    user: req.user,
    ip: req.ip,
  });

  res.redirect(`/school/caisse/${result.payment.id}/ticket`);
}

async function caisseTicket(req, res) {
  const school = req.user.school;
  if (!school?.id) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  const result = await getCaisseTicket(school.id, req.params.id);
  if (!result.ok) {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }

  return res.status(200).render('school/caisse-ticket', {
    user: req.user,
    school,
    payment: result.payment,
    methodLabel,
    formatMoney,
  });
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
    terms: BULLETIN_TERMS,
    formatTermLabel,
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

async function downloadBulletinPdf(req, res) {
  const student = await prisma.student.findFirst({
    where: { id: req.params.studentId, schoolId: req.user.school.id },
  });
  if (!student) return res.redirect('/school/bulletins?error=eleve');

  const period = req.query.period;
  if (!period) return res.redirect('/school/bulletins?error=generation');

  try {
    const result = await streamBulletinPdf({
      studentId: student.id,
      period,
      school: req.user.school,
    });
    if (result.error) return res.redirect(`/school/bulletins?error=${result.error}`);
    return sendPdfDownload(res, result);
  } catch (err) {
    console.error(err);
    return res.redirect('/school/bulletins?error=generation');
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
    return sendPdfDownload(res, result);
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

    const cls = await prisma.class.findFirst({
      where: { id: classId, schoolId: req.user.school.id },
    });
    if (!cls) return res.redirect('/school/teachers?error=1');

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

async function homeworksPage(req, res) {
  const school = req.user.school;
  if (!school) return res.redirect('/auth/login');

  const homeworkList = await prisma.homework.findMany({
    where: { class: { schoolId: school.id } },
    include: {
      class: true,
      teacher: { include: { user: true } },
      _count: { select: { submissions: true } },
    },
    orderBy: { dueDate: 'desc' },
  });

  res.render('school/homeworks', {
    user: req.user,
    school,
    homeworkList,
    stats: summarizeHomeworkStats(homeworkList),
    calendarEventsJson: calendarEventsJson(homeworkList),
  });
}

async function exportHomeworksExcel(req, res) {
  const school = req.user.school;
  if (!school) return res.redirect('/auth/login');
  const result = await generateHomeworkCalendarExcel(school.id);
  if (!result.ok) return res.redirect('/school/homeworks');
  await sendExcel(res, result.filename, result.workbook);
}

async function exportHomeworksPdf(req, res) {
  const school = req.user.school;
  if (!school) return res.redirect('/auth/login');
  const result = await generateHomeworkCalendarPDF(school.id);
  if (!result.ok) return res.redirect('/school/homeworks');
  return sendPdfDownload(res, result);
}

const { STAFF_ROLE_LABELS } = require('../utils/staffPermissions');
const { hashPassword } = require('../utils/password');

const ASSIGNABLE_STAFF_ROLES = ['SECRETARIAT', 'ACCOUNTANT', 'EDUCATOR', 'LIFE_SCHOOL'];

async function staffRolesPage(req, res) {
  const school = req.user.school;
  if (!school) return res.redirect('/auth/login');

  const assignments = await prisma.schoolStaffAssignment.findMany({
    where: { schoolId: school.id },
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } } },
    orderBy: { createdAt: 'asc' },
  });

  res.render('school/staff-roles', {
    school,
    assignments,
    roleLabels: STAFF_ROLE_LABELS,
    assignableRoles: ASSIGNABLE_STAFF_ROLES,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function assignStaffRole(req, res) {
  const school = req.user.school;
  if (!school) return res.redirect('/auth/login');

  const email = String(req.body.email || '').trim().toLowerCase();
  const staffRole = String(req.body.staffRole || '').trim();
  const firstName = String(req.body.firstName || '').trim();
  const lastName = String(req.body.lastName || '').trim();
  const password = String(req.body.password || '').trim();

  if (!email || !ASSIGNABLE_STAFF_ROLES.includes(staffRole)) {
    return res.redirect('/school/staff-roles?error=' + encodeURIComponent('Email et rôle staff requis.'));
  }

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    if (!firstName || !lastName || password.length < 8) {
      return res.redirect('/school/staff-roles?error=' + encodeURIComponent('Nouveau compte : prénom, nom et mot de passe (8 car.) requis.'));
    }
    user = await prisma.user.create({
      data: {
        email,
        password: await hashPassword(password),
        firstName,
        lastName,
        role: 'SCHOOL_ADMIN',
      },
    });
  } else if (user.role !== 'SCHOOL_ADMIN') {
    return res.redirect('/school/staff-roles?error=' + encodeURIComponent('Seuls les comptes SCHOOL_ADMIN peuvent recevoir un rôle staff.'));
  } else if (user.id === school.adminId) {
    return res.redirect('/school/staff-roles?error=' + encodeURIComponent('Le directeur titulaire a déjà tous les accès.'));
  }

  await prisma.schoolStaffAssignment.upsert({
    where: { userId_schoolId: { userId: user.id, schoolId: school.id } },
    create: { userId: user.id, schoolId: school.id, staffRole },
    update: { staffRole },
  });

  return res.redirect('/school/staff-roles?success=' + encodeURIComponent('Rôle staff enregistré.'));
}

async function removeStaffRole(req, res) {
  const school = req.user.school;
  if (!school) return res.redirect('/auth/login');

  const assignment = await prisma.schoolStaffAssignment.findFirst({
    where: { id: req.params.id, schoolId: school.id },
  });
  if (!assignment) {
    return res.redirect('/school/staff-roles?error=' + encodeURIComponent('Affectation introuvable.'));
  }

  await prisma.schoolStaffAssignment.delete({ where: { id: assignment.id } });
  return res.redirect('/school/staff-roles?success=' + encodeURIComponent('Affectation supprimée.'));
}

async function createStudentAccount(req, res) {
  const schoolId = req.user.school?.id;
  const { id } = req.params;
  const { email, password } = req.body;

  try {
    const student = await prisma.student.findFirst({
      where: { id, schoolId },
    });
    if (!student) return res.redirect('/school/students?error=eleve');

    const result = await createStudentUserAccount({
      email,
      password: password || 'ChangeMe123!',
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      actor: req.user,
      ip: req.ip,
    });

    if (!result.ok) {
      const code = result.error === 'email' ? 'email' : (result.error === 'linked' ? 'linked' : 'account');
      return res.redirect(`/school/students?error=${code}`);
    }

    res.redirect('/school/students?success=account');
  } catch (err) {
    console.error(err);
    res.redirect('/school/students?error=account');
  }
}

module.exports = {
  dashboard,
  settings,
  updateSettings,
  coefficientsPage,
  updateCoefficients,
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
  caissePage,
  createCaisseEntry,
  caisseTicket,
  listBulletins,
  generateBulletin,
  generateBulkBulletin,
  downloadBulletinPdf,
  exportBulletinPdf,
  listTeachers,
  inviteTeacher,
  assignTeacherClass,
  updateTeacherPhoto,
  schoolYearPage,
  updateSchoolYear,
  promoteClass,
  LEVEL_ORDER,
  homeworksPage,
  exportHomeworksExcel,
  exportHomeworksPdf,
  smsDashboard,
  staffRolesPage,
  assignStaffRole,
  removeStaffRole,
  createStudentAccount,
};
