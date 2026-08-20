const prisma = require('../config/database');
const { PERMISSIONS: P } = require('../utils/staffPermissions');
const { getStudentFeeBalance } = require('./socialCaseService');
const { loadEnrollmentContext } = require('./enrollmentService');
const { enrollmentStatusLabel } = require('./enrollmentPdf');
const { riskRow, resolveRiskTerm } = require('./riskService');
const { loadSchoolCoefficients } = require('./gradesAverage');
const { termDateRange } = require('./deliberationService');

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

async function loadStudentSituation({ schoolId, schoolYear, studentId, permissions = [] }) {
  const can = (key) => hasPerm(permissions, key);

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    include: {
      class: { select: { id: true, name: true, level: true, series: true } },
      parents: {
        include: {
          parent: {
            include: { user: { select: { email: true, firstName: true, lastName: true } } },
          },
        },
      },
      user: { select: { id: true, email: true } },
    },
  });
  if (!student) return null;

  const sections = {};

  if (can(P.ENROLLMENTS_READ)) {
    const [ctx, yearRecord] = await Promise.all([
      loadEnrollmentContext(schoolId, schoolYear, studentId),
      prisma.studentYearRecord.findUnique({
        where: { studentId_schoolYear: { studentId, schoolYear } },
        include: { class: { select: { id: true, name: true, level: true } } },
      }),
    ]);
    sections.enrollment = {
      enrollment: ctx.enrollment,
      yearRecord: ctx.yearRecord,
      documents: ctx.documents,
      statusLabel: enrollmentStatusLabel(ctx.enrollment?.enrollmentStatus),
    };
    sections.reinscription = yearRecord
      ? {
        enrolled: true,
        repeatYear: yearRecord.repeatYear,
        newClass: yearRecord.class,
        status: yearRecord.status,
      }
      : { enrolled: false };
    sections.yearHistory = await prisma.studentYearRecord.findMany({
      where: { studentId },
      include: { class: { select: { name: true, level: true } } },
      orderBy: { schoolYear: 'desc' },
      take: 6,
    });
  }

  if (can(P.FEES_READ) || can(P.PAYMENTS_READ)) {
    const balance = await getStudentFeeBalance({ schoolId, studentId });
    if (balance.ok) sections.finance = balance;
  }

  if (can(P.PAYMENTS_READ)) {
    sections.payments = await prisma.payment.findMany({
      where: { studentId },
      include: { feeType: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
  }

  if (can(P.SOCIAL_CASES)) {
    sections.socialCase = await prisma.socialCase.findFirst({
      where: { studentId, schoolId, status: 'actif' },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (can(P.ABSENCES)) {
    sections.absences = await prisma.absence.findMany({
      where: { studentId },
      orderBy: { date: 'desc' },
      take: 15,
      include: { justifications: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    sections.absenceCount = await prisma.absence.count({ where: { studentId } });
  }

  if (can(P.BULLETINS_READ) || can(P.STATS)) {
    const coeffMap = await loadSchoolCoefficients(schoolId);
    const withData = await prisma.student.findFirst({
      where: { id: studentId },
      include: { grades: true, absences: true },
    });

    if (can(P.BULLETINS_READ)) {
      const [grades, bulletins, deliberations] = await Promise.all([
        prisma.grade.findMany({
          where: { studentId },
          orderBy: [{ period: 'desc' }, { subject: 'asc' }],
        }),
        prisma.bulletin.findMany({
          where: { studentId },
          orderBy: { generatedAt: 'desc' },
          take: 6,
        }),
        prisma.deliberation.findMany({
          where: { studentId },
          orderBy: [{ schoolYear: 'desc' }, { term: 'asc' }],
        }),
      ]);
      sections.grades = grades;
      sections.bulletins = bulletins;
      sections.deliberations = deliberations;
    }

    if (can(P.STATS) && withData) {
      const term = resolveRiskTerm({ schoolYear, grades: withData.grades || [] });
      const range = termDateRange(schoolYear, term);
      sections.risk = riskRow({
        student: withData,
        coeffMap,
        term,
        range,
      });
      sections.riskTerm = term;
    }
  }

  if (can(P.DISCIPLINE)) {
    const [behaviorNotes, badges] = await Promise.all([
      prisma.behaviorNote.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.badge.findMany({
        where: { studentId },
        orderBy: { awardedAt: 'desc' },
        take: 10,
      }),
    ]);
    sections.behaviorNotes = behaviorNotes;
    sections.badges = badges;
  }

  if (can(P.CANTEEN)) {
    sections.canteenRecords = await prisma.canteenRecord.findMany({
      where: { studentId },
      include: { menu: true },
      orderBy: { menu: { date: 'desc' } },
      take: 8,
    });
  }

  if (can(P.ACTIVITIES)) {
    sections.activities = await prisma.extracurricularEnrollment.findMany({
      where: { studentId },
      include: { activity: { select: { name: true, schedule: true } } },
    });
  }

  if (can(P.PICKUP)) {
    sections.pickupAuthorizations = await prisma.pickupAuthorization.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
  }

  if (can(P.LOST_ITEMS)) {
    sections.lostItems = await prisma.lostItem.findMany({
      where: { studentId, claimed: false },
      orderBy: { foundAt: 'desc' },
      take: 5,
    });
  }

  return { student, sections, schoolYear };
}

module.exports = {
  loadStudentSituation,
};
