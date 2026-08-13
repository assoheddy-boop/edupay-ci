const prisma = require('../config/database');
const { MODULES, MODULE_KEYS } = require('../config/modules');
const {
  getModuleMap,
  setModule,
  initSchoolModules,
  bootstrapPremiumPlatform,
} = require('../utils/modules');
const { hashPassword } = require('../utils/password');
const { logAudit } = require('../utils/audit');
const { ensureSubscriptionPlans, assignPlanToSchool } = require('../utils/plans');

async function loadSchoolsWithModules() {
  const schools = await prisma.school.findMany({
    include: {
      admin: true,
      organization: true,
      modules: true,
      _count: { select: { classes: true, students: true } },
    },
    orderBy: { name: 'asc' },
  });

  return schools.map((school) => {
    const enabledCount = school.modules.filter((m) => m.enabled).length;
    const moduleMap = {};
    MODULE_KEYS.forEach((key) => {
      const row = school.modules.find((m) => m.moduleKey === key);
      moduleMap[key] = {
        enabled: row?.enabled ?? MODULES[key].default,
        locked: row?.locked ?? true,
        ...MODULES[key],
      };
    });
    return { ...school, enabledCount, moduleMap };
  });
}

async function dashboard(req, res) {
  const [schools, organizations, users, moduleRows] = await Promise.all([
    loadSchoolsWithModules(),
    prisma.organization.findMany({
      include: { _count: { select: { schools: true, admins: true } } },
    }),
    prisma.user.count(),
    prisma.schoolModule.findMany({ select: { moduleKey: true, enabled: true } }),
  ]);

  const moduleStats = MODULE_KEYS.map((key) => ({
    key,
    label: MODULES[key].label,
    enabled: moduleRows.filter((r) => r.moduleKey === key && r.enabled).length,
    total: schools.length,
  }));

  res.render('admin/dashboard', {
    user: req.user,
    schools,
    organizations,
    stats: { schools: schools.length, organizations: organizations.length, users },
    moduleStats,
    MODULES,
    MODULE_KEYS,
    success: req.query.success || null,
  });
}

async function modulesHub(req, res) {
  const schools = await loadSchoolsWithModules();
  const selectedId = req.query.school || schools[0]?.id;
  const selected = schools.find((s) => s.id === selectedId) || schools[0];

  res.render('admin/modules', {
    user: req.user,
    schools,
    selected,
    MODULE_KEYS,
    success: req.query.success || null,
  });
}

async function schoolModules(req, res) {
  const { id } = req.params;
  const school = await prisma.school.findUnique({
    where: { id },
    include: { admin: true, organization: true },
  });
  if (!school) return res.redirect('/admin/modules');

  const modules = await getModuleMap(id);
  res.render('admin/school-modules', {
    user: req.user,
    school,
    modules,
    MODULE_KEYS,
    success: req.query.success || null,
  });
}

async function updateSchoolModules(req, res) {
  const { id } = req.params;
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) return res.redirect('/admin/modules');

  const changes = [];
  for (const key of MODULE_KEYS) {
    const enabled = MODULES[key].core ? true : req.body[`mod_${key}`] === 'on';
    await setModule(id, key, { enabled, locked: true });
    changes.push({ key, enabled });
  }

  await prisma.school.update({
    where: { id },
    data: { subscription: 'premium' },
  });

  await logAudit({
    action: 'school_modules_update',
    entity: 'SchoolModule',
    entityId: id,
    user: req.user,
    schoolId: id,
    details: { changes },
    ip: req.ip,
  });

  const redirectTo = req.body.redirect || `/admin/schools/${id}/modules`;
  res.redirect(`${redirectTo}?success=1`);
}

async function enableAllModules(req, res) {
  const { id } = req.params;
  for (const key of MODULE_KEYS) {
    await setModule(id, key, { enabled: true, locked: true });
  }
  await prisma.school.update({ where: { id }, data: { subscription: 'premium' } });
  await logAudit({
    action: 'school_modules_enable_all',
    entity: 'SchoolModule',
    entityId: id,
    user: req.user,
    schoolId: id,
    ip: req.ip,
  });
  res.redirect('/admin/modules?success=all-enabled');
}

async function organizations(req, res) {
  const organizations = await prisma.organization.findMany({
    include: {
      schools: true,
      admins: { include: { user: true } },
    },
  });
  res.render('admin/organizations', {
    user: req.user,
    organizations,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function createOrganization(req, res) {
  const { name, slug } = req.body;
  try {
    await prisma.organization.create({
      data: { name, slug: slug || name.toLowerCase().replace(/\s+/g, '-') },
    });
    res.redirect('/admin/organizations?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/organizations?error=1');
  }
}

async function createOrgAdmin(req, res) {
  const { organizationId, email, firstName, lastName, phone, password } = req.body;
  try {
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) return res.redirect('/admin/organizations?error=org');

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.redirect('/admin/organizations?error=email');

    const hashed = await hashPassword(password || 'demo1234');
    await prisma.user.create({
      data: {
        email,
        password: hashed,
        firstName,
        lastName,
        phone,
        role: 'ORGANIZATION_ADMIN',
        organizationAdmin: { create: { organizationId } },
      },
    });

    await logAudit({
      action: 'org_admin_create',
      entity: 'OrganizationAdmin',
      user: req.user,
      ip: req.ip,
      details: { organizationId, email },
    });

    res.redirect('/admin/organizations?success=admin');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/organizations?error=admin');
  }
}

async function assignSchoolToOrg(req, res) {
  const { schoolId, organizationId, campusLabel } = req.body;
  await prisma.school.update({
    where: { id: schoolId },
    data: {
      organizationId: organizationId || null,
      campusLabel: campusLabel || null,
      subscription: 'premium',
    },
  });
  if (organizationId) {
    await initSchoolModules(schoolId);
    await setModule(schoolId, 'multi_campus', { enabled: true, locked: true });
  }
  res.redirect('/admin/organizations?success=assigned');
}

async function plansPage(req, res) {
  await ensureSubscriptionPlans();
  const plans = await prisma.subscriptionPlan.findMany({
    include: { schools: { select: { id: true } } },
    orderBy: { price: 'asc' },
  });
  const schools = await prisma.school.findMany({
    include: { plan: true, admin: true, organization: true },
    orderBy: { name: 'asc' },
  });

  res.render('admin/plans', {
    user: req.user,
    plans,
    schools,
    MODULES,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function activatePlanModules(req, res) {
  const { schoolId, planId } = req.body;
  if (!schoolId || !planId) return res.redirect('/admin/plans?error=missing');

  const result = await assignPlanToSchool(schoolId, planId);
  if (!result.ok) return res.redirect('/admin/plans?error=plan');

  await logAudit({
    action: 'school_plan_activate',
    entity: 'School',
    entityId: schoolId,
    user: req.user,
    schoolId,
    details: { planId: result.plan.id, planName: result.plan.name, features: result.plan.features },
    ip: req.ip,
  });

  res.redirect('/admin/plans?success=activated');
}

module.exports = {
  dashboard,
  modulesHub,
  schoolModules,
  updateSchoolModules,
  enableAllModules,
  bootstrapPremiumPlatform,
  organizations,
  createOrganization,
  createOrgAdmin,
  assignSchoolToOrg,
  plansPage,
  activatePlanModules,
};
