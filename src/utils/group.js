const prisma = require('../config/database');
const { computeAverage } = require('../services/bulletinPdf');
const { getModuleMap } = require('./modules');

function collectionRate(revenue, pendingAmount) {
  const total = (revenue || 0) + (pendingAmount || 0);
  if (!total) return 0;
  return Math.round(((revenue || 0) / total) * 100);
}

async function loadOrganization(req) {
  const orgId = req.user?.organizationAdmin?.organizationId;
  if (!orgId) return null;
  return prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      schools: { orderBy: { name: 'asc' } },
      admins: { include: { user: true } },
    },
  });
}

function schoolInOrg(organization, schoolId) {
  return organization.schools.find((s) => s.id === schoolId) || null;
}

async function snapshotCampus(school) {
  const schoolId = school.id;
  const [
    students,
    teachers,
    classes,
    validated,
    pending,
    absences,
    grades,
    pendingLeaves,
    staffActive,
    modules,
  ] = await Promise.all([
    prisma.student.count({ where: { schoolId } }),
    prisma.teacher.count({ where: { schoolId } }),
    prisma.class.count({ where: { schoolId } }),
    prisma.payment.aggregate({
      where: { status: 'VALIDATED', student: { schoolId } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: { status: 'PENDING', student: { schoolId } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.absence.count({ where: { student: { schoolId } } }),
    prisma.grade.findMany({
      where: { student: { schoolId } },
      select: { value: true, maxValue: true },
    }),
    prisma.leaveRequest.count({ where: { schoolId, status: 'PENDING' } }),
    prisma.staffProfile.count({ where: { schoolId, status: 'ACTIVE' } }),
    getModuleMap(schoolId),
  ]);

  const revenue = validated._sum.amount || 0;
  const pendingAmount = pending._sum.amount || 0;

  return {
    school,
    students,
    teachers,
    classes,
    revenue,
    validatedCount: validated._count || 0,
    pendingAmount,
    pendingCount: pending._count || 0,
    absences,
    avgGrade: grades.length ? computeAverage(grades) : 0,
    collectionRate: collectionRate(revenue, pendingAmount),
    pendingLeaves,
    staffActive,
    modules,
  };
}

async function snapshotAllCampuses(schools) {
  return Promise.all(schools.map(snapshotCampus));
}

function consolidate(snapshots) {
  const acc = {
    campuses: snapshots.length,
    students: 0,
    teachers: 0,
    classes: 0,
    revenue: 0,
    pendingAmount: 0,
    pendingCount: 0,
    validatedCount: 0,
    absences: 0,
    pendingLeaves: 0,
    staffActive: 0,
  };
  snapshots.forEach((s) => {
    acc.students += s.students;
    acc.teachers += s.teachers;
    acc.classes += s.classes;
    acc.revenue += s.revenue;
    acc.pendingAmount += s.pendingAmount;
    acc.pendingCount += s.pendingCount;
    acc.validatedCount += s.validatedCount;
    acc.absences += s.absences;
    acc.pendingLeaves += s.pendingLeaves;
    acc.staffActive += s.staffActive;
  });
  acc.collectionRate = collectionRate(acc.revenue, acc.pendingAmount);
  const withGrades = snapshots.filter((s) => s.students > 0);
  acc.avgGrade = withGrades.length
    ? Math.round((withGrades.reduce((sum, s) => sum + s.avgGrade, 0) / withGrades.length) * 100) / 100
    : 0;
  return acc;
}

module.exports = {
  collectionRate,
  loadOrganization,
  schoolInOrg,
  snapshotCampus,
  snapshotAllCampuses,
  consolidate,
};
