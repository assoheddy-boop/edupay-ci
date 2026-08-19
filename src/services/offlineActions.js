const prisma = require('../config/database');
const { sendNotification } = require('../../services/NotificationService');
const { validateProof, MAX_PROOF_SIZE: PROOF_LIMIT } = require('../../services/PaymentService');
const { createTeacherProfile } = require('../../services/HRService');
const { parseGender } = require('../../services/ClassService');
const { storeMulterFile } = require('../../services/StorageService');
const { logAudit } = require('../utils/audit');
const { isTempId, resolveEntityId, mapPayloadIds, payloadHasUnresolvedTempId } = require('../utils/offlineQueue');
const { hasEffectiveRole } = require('../utils/adminAssist');
const { isDangerousUpload } = require('../utils/uploadSafety');
const {
  buildHomeworkCreateData,
  hasHomeworkContent,
  parentPublishMessage,
} = require('./homeworkService');
const { canonicalPeriod, normalizeTerm } = require('./academicTerms');
const { upsertSubjectCoefficient, parseCoefficient } = require('./gradesAverage');

const MAX_PROOF_SIZE = PROOF_LIMIT || 5 * 1024 * 1024;

function attendanceTypeFromStatus(raw) {
  const v = String(raw || 'present').toLowerCase();
  if (v === 'late' || v === 'retard') return 'LATE';
  if (v === 'absent' || v === 'absence') return 'ABSENCE';
  return null;
}

function statusesFromBody(body = {}) {
  const statuses = body.statuses && typeof body.statuses === 'object' ? { ...body.statuses } : {};
  for (const [key, value] of Object.entries(body)) {
    if (key.startsWith('status_')) statuses[key.slice(7)] = value;
  }
  return statuses;
}

function gradesFromBody(body = {}) {
  const grades = body.grades && typeof body.grades === 'object' ? { ...body.grades } : {};
  for (const [key, value] of Object.entries(body)) {
    if (key.startsWith('grade_')) grades[key.slice(6)] = value;
  }
  return grades;
}

function fileFromSyncPayload(file) {
  if (!file) return null;
  let decoded = null;
  if (file.buffer && Buffer.isBuffer(file.buffer)) {
    decoded = file;
  } else if (file.data) {
    const buffer = Buffer.from(file.data, 'base64');
    decoded = {
      buffer,
      originalname: file.name || file.originalname || 'file.bin',
      mimetype: file.type || file.mimetype || 'application/octet-stream',
      size: buffer.length,
    };
  }
  if (!decoded) return null;
  if (isDangerousUpload(decoded)) return null;
  return decoded;
}

function assertFileSize(file) {
  if (!file) return { ok: true };
  const size = Number(file.size || file.buffer?.length || 0);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'file' };
  if (size > MAX_PROOF_SIZE) return { ok: false, error: 'size' };
  return { ok: true };
}

function forbidden(entity) {
  return { ok: false, error: 'forbidden', entity };
}

function requireTeacher(user) {
  if (!user?.teacher?.id) return null;
  if (user.role && user.role !== 'TEACHER') return null;
  return user.teacher;
}

function requireSchoolAdmin(user) {
  if (!user?.school?.id) return null;
  if (!hasEffectiveRole(user, 'SCHOOL_ADMIN')) return null;
  return user.school;
}

function requireParent(user) {
  if (!user?.parentProfile?.id) return null;
  if (user.role && user.role !== 'PARENT') return null;
  return user.parentProfile;
}

async function notifyAttendance(student, date, type) {
  const parents = await prisma.parentStudent.findMany({
    where: { studentId: student.id },
    include: { parent: true },
  });
  const day = new Date(date).toLocaleDateString('fr-FR');
  const kind = type === 'LATE' ? 'late_reported' : 'absence_reported';
  const message = type === 'LATE'
    ? `${student.firstName} en retard le ${day}.`
    : `${student.firstName} absent le ${day}.`;
  for (const ps of parents) {
    await sendNotification(ps.parent.userId, kind, message, { schoolId: student.schoolId });
  }
}

async function applyAttendance({ user, payload = {} }) {
  const teacher = requireTeacher(user);
  if (!teacher) return forbidden('attendance');

  const classId = resolveEntityId(payload.classId);
  const date = payload.date;
  if (!classId || isTempId(classId) || !date) {
    return { ok: false, error: 'unknown_id', entity: 'attendance' };
  }

  const ownedClass = await prisma.teacherClass.findFirst({
    where: { teacherId: teacher.id, classId },
  });
  if (!ownedClass) return forbidden('attendance');

  const statuses = statusesFromBody(payload);
  for (const studentId of Object.keys(statuses)) {
    if (isTempId(studentId) || !resolveEntityId(studentId)) {
      return { ok: false, error: 'unknown_id', entity: 'attendance' };
    }
  }

  const students = await prisma.student.findMany({
    where: { classId, class: { teachers: { some: { teacherId: teacher.id } } } },
  });
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  for (const student of students) {
    const type = attendanceTypeFromStatus(statuses[student.id]);
    const existing = await prisma.absence.findFirst({
      where: { studentId: student.id, date: dayStart },
    });

    if (!type) {
      if (existing) await prisma.absence.delete({ where: { id: existing.id } });
      continue;
    }

    if (existing) {
      if (existing.type !== type) {
        await prisma.absence.update({
          where: { id: existing.id },
          data: {
            type,
            reason: type === 'LATE' ? 'Retard (appel)' : 'Appel du jour',
            recordedBy: teacher.id,
          },
        });
        await notifyAttendance(student, date, type);
      }
      continue;
    }

    await prisma.absence.create({
      data: {
        studentId: student.id,
        date: dayStart,
        type,
        reason: type === 'LATE' ? 'Retard (appel)' : 'Appel du jour',
        recordedBy: teacher.id,
      },
    });
    await notifyAttendance(student, date, type);
  }

  return { ok: true, entity: 'attendance' };
}

async function notifyNewGrade(student, value, maxValue, subject) {
  for (const link of student?.parents || []) {
    await prisma.notification.create({
      data: {
        userId: link.parent.userId,
        type: 'GENERAL',
        title: 'Nouvelle note',
        body: `${student.firstName} a reçu ${value}/${maxValue || 20} en ${subject}.`,
      },
    });
  }
}

async function applyGrade({ user, payload = {} }) {
  const teacher = requireTeacher(user);
  if (!teacher) return forbidden('grade');

  const bulkGrades = gradesFromBody(payload);
  const isBulk = Object.keys(bulkGrades).length > 0 && (payload.classId || payload.subject);

  if (isBulk && payload.classId) {
    const classId = resolveEntityId(payload.classId);
    if (!classId || isTempId(classId)) return { ok: false, error: 'unknown_id', entity: 'grade' };
    const ownedClass = await prisma.teacherClass.findFirst({
      where: { teacherId: teacher.id, classId },
    });
    if (!ownedClass) return forbidden('grade');
    for (const studentId of Object.keys(bulkGrades)) {
      if (isTempId(studentId)) return { ok: false, error: 'unknown_id', entity: 'grade' };
    }

    const { subject, period, maxValue, coefficient } = payload;
    if (!subject || !period) return { ok: false, error: 'data', entity: 'grade' };

    const term = normalizeTerm(period);
    const storedPeriod = canonicalPeriod(period);
    await upsertSubjectCoefficient(teacher.schoolId, subject, parseCoefficient(coefficient));

    const students = await prisma.student.findMany({
      where: { classId, class: { teachers: { some: { teacherId: teacher.id } } } },
    });

    const created = [];
    for (const student of students) {
      const val = bulkGrades[student.id];
      if (val == null || val === '') continue;
      const grade = await prisma.grade.create({
        data: {
          studentId: student.id,
          teacherId: teacher.id,
          subject,
          period: storedPeriod,
          term,
          value: parseFloat(val),
          maxValue: parseFloat(maxValue || 20),
        },
      });
      created.push(grade.id);
    }
    return { ok: true, entity: 'grade', ids: created };
  }

  const studentId = resolveEntityId(payload.studentId);
  if (!studentId || isTempId(studentId)) return { ok: false, error: 'unknown_id', entity: 'grade' };

  const { subject, value, maxValue, period, comment, coefficient } = payload;
  if (!subject || value == null || value === '' || !period) {
    return { ok: false, error: 'data', entity: 'grade' };
  }

  const owned = await prisma.student.findFirst({
    where: { id: studentId, class: { teachers: { some: { teacherId: teacher.id } } } },
    include: { parents: { include: { parent: true } } },
  });
  if (!owned) return { ok: false, error: 'forbidden', entity: 'grade' };

  const term = normalizeTerm(period);
  const storedPeriod = canonicalPeriod(period);
  await upsertSubjectCoefficient(teacher.schoolId, subject, parseCoefficient(coefficient));

  const grade = await prisma.grade.create({
    data: {
      studentId,
      teacherId: teacher.id,
      subject,
      value: parseFloat(value),
      maxValue: parseFloat(maxValue || 20),
      period: storedPeriod,
      term,
      comment,
    },
  });

  await notifyNewGrade(owned, value, maxValue, subject);
  return { ok: true, id: grade.id, entity: 'grade' };
}

async function applyHomework({ user, payload = {}, file = null }) {
  const teacher = requireTeacher(user);
  if (!teacher) return forbidden('homework');

  const classId = resolveEntityId(payload.classId);
  if (!classId || isTempId(classId) || !payload.dueDate || !hasHomeworkContent(payload)) {
    return { ok: false, error: classId && isTempId(classId) ? 'unknown_id' : 'data', entity: 'homework' };
  }

  const link = await prisma.teacherClass.findFirst({
    where: { teacherId: teacher.id, classId },
  });
  if (!link) return { ok: false, error: 'class', entity: 'homework' };

  const sizeCheck = assertFileSize(file);
  if (!sizeCheck.ok) return { ...sizeCheck, entity: 'homework' };

  let attachmentUrl = payload.attachmentUrl || null;
  if (file) {
    if (file.url) {
      attachmentUrl = file.url;
    } else {
      const stored = await storeMulterFile(file, 'homeworks');
      attachmentUrl = stored?.url || file.url || null;
    }
  }

  const data = buildHomeworkCreateData({
    classId,
    teacherId: teacher.id,
    payload,
    attachmentUrl,
  });

  const homework = await prisma.homework.create({ data });

  const students = await prisma.student.findMany({
    where: { classId },
    include: { parents: { include: { parent: true } } },
  });

  for (const student of students) {
    for (const ps of student.parents) {
      await sendNotification(
        ps.parent.userId,
        'new_homework',
        parentPublishMessage({
          kind: data.kind,
          subject: data.subject,
          title: data.title,
          dueDate: data.dueDate,
          studentName: student.firstName,
        }),
        { schoolId: student.schoolId || teacher.schoolId },
      );
    }
    await prisma.homeworkSubmission.create({
      data: { homeworkId: homework.id, studentId: student.id },
    });
  }

  return { ok: true, id: homework.id, entity: 'homework' };
}

async function applyClass({ user, payload = {} }) {
  const school = requireSchoolAdmin(user);
  if (!school) return forbidden('class');

  const name = String(payload.name || '').trim();
  const level = String(payload.level || '').trim();
  if (!name || !level) return { ok: false, error: 'data', entity: 'class' };

  const created = await prisma.class.create({
    data: {
      name,
      level,
      schoolYear: payload.schoolYear || school.currentSchoolYear,
      schoolId: school.id,
    },
  });
  await logAudit({ action: 'class_create', entity: 'Class', user, details: { name } });
  return { ok: true, id: created.id, entity: 'class' };
}

async function applyStudent({ user, payload = {}, file = null }) {
  const school = requireSchoolAdmin(user);
  if (!school) return forbidden('student');

  const firstName = String(payload.firstName || '').trim();
  const lastName = String(payload.lastName || '').trim();
  const classId = resolveEntityId(payload.classId);
  if (!firstName || !lastName) return { ok: false, error: 'data', entity: 'student' };
  if (!classId || isTempId(classId)) return { ok: false, error: 'unknown_id', entity: 'student' };

  const cls = await prisma.class.findFirst({ where: { id: classId, schoolId: school.id } });
  if (!cls) return { ok: false, error: 'class', entity: 'student' };

  const sizeCheck = assertFileSize(file);
  if (!sizeCheck.ok) return { ...sizeCheck, entity: 'student' };

  try {
    const created = await prisma.student.create({
      data: {
        firstName,
        lastName,
        matricule: payload.matricule || null,
        classId,
        schoolId: school.id,
        birthDate: payload.birthDate ? new Date(payload.birthDate) : null,
        gender: parseGender(payload.gender),
      },
    });

    if (file) {
      const { savePersonPhoto } = require('../utils/media');
      const { photoUrl } = await savePersonPhoto('student', created.id, file);
      await prisma.student.update({ where: { id: created.id }, data: { photoUrl } });
    }

    await logAudit({
      action: 'student_create',
      entity: 'Student',
      user,
      details: { matricule: payload.matricule },
    });
    return { ok: true, id: created.id, entity: 'student' };
  } catch (err) {
    if (err.code === 'P2002') return { ok: false, error: 'matricule', entity: 'student' };
    throw err;
  }
}

function teacherConflict(existing, field) {
  return {
    ok: false,
    error: 'conflict',
    entity: 'teacher',
    existing: existing
      ? {
        id: existing.id,
        email: existing.email,
        phone: existing.phone,
        firstName: existing.firstName,
        lastName: existing.lastName,
        role: existing.role,
        field,
      }
      : { field },
  };
}

async function applyTeacher({ user, payload = {}, file = null }) {
  const school = requireSchoolAdmin(user);
  if (!school) return forbidden('teacher');

  const email = String(payload.email || '').trim().toLowerCase();
  const firstName = String(payload.firstName || '').trim();
  const lastName = String(payload.lastName || '').trim();
  const phone = String(payload.phone || '').trim();
  if (!email || !firstName || !lastName) return { ok: false, error: 'data', entity: 'teacher' };

  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) return teacherConflict(byEmail, 'email');

  if (phone) {
    const byPhone = await prisma.user.findFirst({ where: { phone } });
    if (byPhone) return teacherConflict(byPhone, 'phone');
  }

  const sizeCheck = assertFileSize(file);
  if (!sizeCheck.ok) return { ...sizeCheck, entity: 'teacher' };

  const result = await createTeacherProfile({
    email,
    firstName,
    lastName,
    phone: phone || null,
    subject: payload.subject,
    password: payload.password,
    schoolId: school.id,
  });

  if (!result.ok) {
    if (result.error === 'email') {
      const existing = await prisma.user.findUnique({ where: { email } });
      return teacherConflict(existing, 'email');
    }
    return { ok: false, error: result.error || 'invite', entity: 'teacher' };
  }

  if (file && result.user) {
    const { savePersonPhoto } = require('../utils/media');
    const { photoUrl } = await savePersonPhoto('user', result.user.id, file);
    await prisma.user.update({ where: { id: result.user.id }, data: { photoUrl } });
  }

  await logAudit({
    action: 'teacher_invite',
    entity: 'Teacher',
    entityId: result.teacher.id,
    user,
    details: { email, subject: payload.subject },
  });

  return { ok: true, id: result.teacher.id, entity: 'teacher' };
}

async function applyPayment({ user, payload = {}, file = null }) {
  const parent = requireParent(user);
  if (!parent) return forbidden('payment');

  const studentId = resolveEntityId(payload.studentId);
  if (!studentId || isTempId(studentId)) return { ok: false, error: 'child', entity: 'payment' };

  const link = await prisma.parentStudent.findFirst({
    where: { parentId: parent.id, studentId: String(studentId) },
  });
  if (!link) return { ok: false, error: 'child', entity: 'payment' };

  const amount = parseInt(payload.amount, 10);
  if (!Number.isFinite(amount) || amount < 100) return { ok: false, error: 'data', entity: 'payment' };

  const sizeCheck = assertFileSize(file);
  if (!sizeCheck.ok) return { ...sizeCheck, entity: 'payment' };

  let feeTypeId = payload.feeTypeId || null;
  if (feeTypeId) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { schoolId: true },
    });
    if (!student) return { ok: false, error: 'child', entity: 'payment' };
    const fee = await prisma.feeType.findFirst({
      where: { id: String(feeTypeId), schoolId: student.schoolId },
    });
    if (!fee) return { ok: false, error: 'data', entity: 'payment' };
    feeTypeId = fee.id;
  }

  let proofUrl = null;
  let proofId = null;

  if (file) {
    const proof = await validateProof(file, studentId);
    if (!proof.ok) return { ok: false, error: proof.error, entity: 'payment' };
    proofUrl = proof.fileUrl;
    proofId = proof.proof.id;
  }

  const payment = await prisma.payment.create({
    data: {
      studentId,
      amount,
      feeTypeId,
      reference: payload.reference,
      proofUrl,
      status: 'PENDING',
    },
  });

  if (proofId) {
    await prisma.paymentProof.update({
      where: { id: proofId },
      data: { paymentId: payment.id },
    });
  }

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

  return { ok: true, id: payment.id, entity: 'payment' };
}

async function applyItem({ user, type, payload, file, idMap = {} }) {
  const mapped = mapPayloadIds(type, payload || {}, idMap);
  if (payloadHasUnresolvedTempId(type, mapped) && type !== 'class' && type !== 'teacher') {
    return { ok: false, error: 'unknown_id', entity: type };
  }

  const decodedFile = fileFromSyncPayload(file) || fileFromSyncPayload(mapped.file) || file;
  const cleanPayload = { ...mapped };
  delete cleanPayload.file;

  switch (type) {
    case 'attendance':
      return applyAttendance({ user, payload: cleanPayload });
    case 'grade':
      return applyGrade({ user, payload: cleanPayload });
    case 'homework':
      return applyHomework({ user, payload: cleanPayload, file: decodedFile });
    case 'class':
      return applyClass({ user, payload: cleanPayload });
    case 'student':
      return applyStudent({ user, payload: cleanPayload, file: decodedFile });
    case 'teacher':
      return applyTeacher({ user, payload: cleanPayload, file: decodedFile });
    case 'payment':
      return applyPayment({ user, payload: cleanPayload, file: decodedFile });
    default:
      return { ok: false, error: 'type', entity: type };
  }
}

async function resolveTeacherConflict({ user, action, existing }) {
  const school = requireSchoolAdmin(user);
  if (!school) return forbidden('teacher');
  if (action === 'cancel') return { ok: true, status: 'cancelled' };
  if (action !== 'merge') return { ok: false, error: 'action', entity: 'teacher' };

  const existingId = existing?.id;
  if (!existingId || isTempId(existingId)) {
    return { ok: true, status: 'synced', merged: true };
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: existingId },
    include: { teacher: true },
  });
  const teacherId = existingUser?.teacher?.id;
  if (!teacherId || existingUser.teacher.schoolId !== school.id) {
    return forbidden('teacher');
  }
  return { ok: true, status: 'synced', serverId: teacherId, merged: true };
}

module.exports = {
  attendanceTypeFromStatus,
  statusesFromBody,
  gradesFromBody,
  fileFromSyncPayload,
  applyAttendance,
  applyGrade,
  applyHomework,
  applyClass,
  applyStudent,
  applyTeacher,
  applyPayment,
  applyItem,
  resolveTeacherConflict,
  MAX_PROOF_SIZE,
};
