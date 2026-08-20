const prisma = require('../config/database');
const {
  parseDocumentsChecklist,
  mergeChecklist,
} = require('../utils/enrollmentForm');
const {
  normalizeNationalMatricule,
  assertNationalMatriculeAvailable,
} = require('../utils/nationalMatricule');
const { parseGender } = require('../../services/ClassService');
const { parseSeries } = require('./series');

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function str(value) {
  const s = String(value || '').trim();
  return s || null;
}

async function classGenderCounts(classId) {
  if (!classId) return { male: 0, female: 0, total: 0 };
  const rows = await prisma.student.findMany({
    where: { classId },
    select: { gender: true },
  });
  let male = 0;
  let female = 0;
  rows.forEach((r) => {
    if (r.gender === 'M') male += 1;
    else if (r.gender === 'F') female += 1;
  });
  return { male, female, total: rows.length };
}

function studentPayloadFromBody(body) {
  return {
    firstName: str(body.firstName),
    lastName: str(body.lastName),
    matricule: str(body.matricule),
    nationalMatricule: normalizeNationalMatricule(body.nationalMatricule),
    birthDate: parseDate(body.birthDate),
    birthPlace: str(body.birthPlace),
    gender: parseGender(body.gender),
    nationality: str(body.nationality) || 'Ivoirienne',
    fatherName: str(body.fatherName),
    motherName: str(body.motherName),
    guardianName: str(body.guardianName),
    guardianPhone: str(body.guardianPhone),
    contactPhone: str(body.contactPhone),
    contactEmail: str(body.contactEmail)?.toLowerCase() || null,
    classId: str(body.classId),
    series: parseSeries(body.series),
  };
}

function enrollmentPayloadFromBody(body, schoolYear) {
  return {
    schoolYear,
    enrolledAt: parseDate(body.enrolledAt) || new Date(),
    enrollmentStatus: str(body.enrollmentStatus) || 'NOUVEAU',
    lv2: str(body.lv2),
    birthCertNumber: str(body.birthCertNumber),
    birthCertDate: parseDate(body.birthCertDate),
    birthCertPlace: str(body.birthCertPlace),
    previousSchool: str(body.previousSchool),
    previousClass: str(body.previousClass),
    transferRef: str(body.transferRef),
    decisionNumber: str(body.decisionNumber),
    isScholarship: body.isScholarship === 'on' || body.isScholarship === 'true',
    documentsChecklist: parseDocumentsChecklist(body),
    notes: str(body.notes),
  };
}

async function loadEnrollmentContext(schoolId, schoolYear, studentId = null) {
  const [school, classes, student, enrollment, yearRecord] = await Promise.all([
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, currentSchoolYear: true, educationCycle: true },
    }),
    prisma.class.findMany({
      where: { schoolId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, series: true },
    }),
    studentId
      ? prisma.student.findFirst({
        where: { id: studentId, schoolId },
        include: { class: { select: { id: true, name: true } } },
      })
      : null,
    studentId
      ? prisma.studentEnrollment.findUnique({
        where: { studentId_schoolYear: { studentId, schoolYear } },
      })
      : null,
    studentId
      ? prisma.studentYearRecord.findUnique({
        where: { studentId_schoolYear: { studentId, schoolYear } },
      })
      : null,
  ]);

  const classId = student?.classId || null;
  const effectif = await classGenderCounts(classId);

  return {
    school,
    schoolYear,
    classes,
    student,
    enrollment,
    yearRecord,
    documents: mergeChecklist(enrollment?.documentsChecklist),
    effectif,
  };
}

async function saveNewEnrollment({ schoolId, schoolYear, body, file = null }) {
  const studentData = studentPayloadFromBody(body);
  if (!studentData.firstName || !studentData.lastName || !studentData.classId) {
    return { ok: false, error: 'data' };
  }

  const cls = await prisma.class.findFirst({
    where: { id: studentData.classId, schoolId },
  });
  if (!cls) return { ok: false, error: 'class' };

  const uniqueNat = await assertNationalMatriculeAvailable({
    prisma,
    schoolId,
    nationalMatricule: studentData.nationalMatricule,
  });
  if (!uniqueNat.ok) return { ok: false, error: 'nationalMatricule' };

  const enrollmentData = enrollmentPayloadFromBody(body, schoolYear);
  const repeatYear = body.repeatYear === 'on' || body.repeatYear === 'true';

  try {
    const result = await prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          firstName: studentData.firstName,
          lastName: studentData.lastName,
          matricule: studentData.matricule,
          nationalMatricule: studentData.nationalMatricule,
          birthDate: studentData.birthDate,
          birthPlace: studentData.birthPlace,
          gender: studentData.gender,
          nationality: studentData.nationality,
          fatherName: studentData.fatherName,
          motherName: studentData.motherName,
          guardianName: studentData.guardianName,
          guardianPhone: studentData.guardianPhone,
          contactPhone: studentData.contactPhone,
          contactEmail: studentData.contactEmail,
          classId: studentData.classId,
          schoolId,
          series: studentData.series,
        },
      });

      await tx.studentEnrollment.create({
        data: {
          ...enrollmentData,
          studentId: student.id,
          schoolId,
        },
      });

      await tx.studentYearRecord.upsert({
        where: { studentId_schoolYear: { studentId: student.id, schoolYear } },
        create: {
          studentId: student.id,
          schoolYear,
          classId: studentData.classId,
          schoolId,
          repeatYear,
          status: enrollmentData.enrollmentStatus,
          gender: studentData.gender,
        },
        update: {
          classId: studentData.classId,
          repeatYear,
          status: enrollmentData.enrollmentStatus,
          gender: studentData.gender,
        },
      });

      return student;
    });

    if (file) {
      const { savePersonPhoto } = require('../utils/media');
      const { photoUrl } = await savePersonPhoto('student', result.id, file);
      await prisma.student.update({ where: { id: result.id }, data: { photoUrl } });
    }

    return { ok: true, studentId: result.id };
  } catch (err) {
    if (err.code === 'P2002') {
      const target = err.meta?.target || [];
      if (target.includes('matricule')) return { ok: false, error: 'matricule' };
      if (target.includes('nationalMatricule')) return { ok: false, error: 'nationalMatricule' };
    }
    throw err;
  }
}

async function saveExistingEnrollment({ schoolId, schoolYear, studentId, body, file = null }) {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) return { ok: false, error: 'not_found' };

  const studentData = studentPayloadFromBody(body);
  if (!studentData.firstName || !studentData.lastName || !studentData.classId) {
    return { ok: false, error: 'data' };
  }

  const cls = await prisma.class.findFirst({
    where: { id: studentData.classId, schoolId },
  });
  if (!cls) return { ok: false, error: 'class' };

  const uniqueNat = await assertNationalMatriculeAvailable({
    prisma,
    schoolId,
    nationalMatricule: studentData.nationalMatricule,
    excludeId: studentId,
  });
  if (!uniqueNat.ok) return { ok: false, error: 'nationalMatricule' };

  const enrollmentData = enrollmentPayloadFromBody(body, schoolYear);
  const repeatYear = body.repeatYear === 'on' || body.repeatYear === 'true';

  await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id: studentId },
      data: {
        firstName: studentData.firstName,
        lastName: studentData.lastName,
        matricule: studentData.matricule,
        nationalMatricule: studentData.nationalMatricule,
        birthDate: studentData.birthDate,
        birthPlace: studentData.birthPlace,
        gender: studentData.gender,
        nationality: studentData.nationality,
        fatherName: studentData.fatherName,
        motherName: studentData.motherName,
        guardianName: studentData.guardianName,
        guardianPhone: studentData.guardianPhone,
        contactPhone: studentData.contactPhone,
        contactEmail: studentData.contactEmail,
        classId: studentData.classId,
        series: studentData.series,
      },
    });

    await tx.studentEnrollment.upsert({
      where: { studentId_schoolYear: { studentId, schoolYear } },
      create: {
        ...enrollmentData,
        studentId,
        schoolId,
      },
      update: enrollmentData,
    });

    await tx.studentYearRecord.upsert({
      where: { studentId_schoolYear: { studentId, schoolYear } },
      create: {
        studentId,
        schoolYear,
        classId: studentData.classId,
        schoolId,
        repeatYear,
        status: enrollmentData.enrollmentStatus,
        gender: studentData.gender,
      },
      update: {
        classId: studentData.classId,
        repeatYear,
        status: enrollmentData.enrollmentStatus,
        gender: studentData.gender,
      },
    });
  });

  if (body.removePhoto === 'on') {
    const { removePersonPhoto } = require('../utils/media');
    removePersonPhoto('student', studentId);
    await prisma.student.update({ where: { id: studentId }, data: { photoUrl: null } });
  }
  if (file) {
    const { savePersonPhoto } = require('../utils/media');
    const { photoUrl } = await savePersonPhoto('student', studentId, file);
    await prisma.student.update({ where: { id: studentId }, data: { photoUrl } });
  }

  return { ok: true, studentId };
}

async function listEnrollmentsForYear(schoolId, schoolYear) {
  const students = await prisma.student.findMany({
    where: { schoolId },
    include: {
      class: { select: { name: true } },
      enrollments: { where: { schoolYear } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  return students.map((s) => ({
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    matricule: s.matricule,
    nationalMatricule: s.nationalMatricule,
    className: s.class?.name,
    enrolled: Boolean(s.enrollments?.length),
    enrollmentStatus: s.enrollments[0]?.enrollmentStatus || null,
    enrolledAt: s.enrollments[0]?.enrolledAt || null,
  }));
}

module.exports = {
  classGenderCounts,
  loadEnrollmentContext,
  saveNewEnrollment,
  saveExistingEnrollment,
  listEnrollmentsForYear,
};
