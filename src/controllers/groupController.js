const prisma = require('../config/database');
const { getModuleMap } = require('../utils/modules');

async function dashboard(req, res) {
  const orgId = req.user.organizationAdmin?.organizationId;
  if (!orgId) return res.redirect('/auth/login');

  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      schools: {
        include: {
          _count: { select: { classes: true, teachers: true } },
        },
      },
    },
  });

  const schoolIds = organization.schools.map((s) => s.id);

  const [students, payments, absences] = await Promise.all([
    prisma.student.count({ where: { class: { schoolId: { in: schoolIds } } } }),
    prisma.payment.groupBy({
      by: ['status'],
      where: { student: { class: { schoolId: { in: schoolIds } } } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.absence.count({ where: { student: { class: { schoolId: { in: schoolIds } } } } }),
  ]);

  const campusStats = await Promise.all(
    organization.schools.map(async (school) => {
      const [stu, pay, mod] = await Promise.all([
        prisma.student.count({ where: { class: { schoolId: school.id } } }),
        prisma.payment.aggregate({
          where: { status: 'VALIDATED', student: { class: { schoolId: school.id } } },
          _sum: { amount: true },
        }),
        getModuleMap(school.id),
      ]);
      return {
        school,
        students: stu,
        revenue: pay._sum.amount || 0,
        modules: mod,
      };
    }),
  );

  res.render('group/dashboard', {
    user: req.user,
    organization,
    stats: { students, payments, absences, campuses: organization.schools.length },
    campusStats,
  });
}

module.exports = { dashboard };
