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
const { ensureSubscriptionPlans, assignPlanToSchool, updatePlanFeatures } = require('../utils/plans');
const { ensureGroupForOrganization } = require('../utils/group');
const { getGenderStatsBySchool } = require('../../services/ClassService');
const {
  beginSchoolAssist,
  beginGroupAssist,
  stopAssist,
} = require('../utils/adminAssist');
const { safeInternalPath } = require('../utils/cookies');
const { sendConnectivityTestSms, smsConfigured, smsProvider } = require('../services/sms');
const { resolveSmsSender } = require('../utils/officialSms');
const { parseEducationCycle, EDUCATION_CYCLE_OPTIONS, CYCLE_LABELS } = require('../utils/educationCycle');
const {
  MARKETPLACE_MODULE,
  MARKETPLACE_TIER_OPTIONS,
  parseMarketplaceTier,
  applyMarketplaceOffer,
  syncMarketplaceAfterModuleChange,
} = require('../utils/marketplaceAddon');

async function loadSchoolsWithModules() {
  const schools = await prisma.school.findMany({
    include: {
      admin: true,
      organization: true,
      modules: true,
      plan: true,
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
  const [schools, organizations, users, moduleRows, students, pendingTransfers, genderStats] = await Promise.all([
    loadSchoolsWithModules(),
    prisma.organization.findMany({
      include: { _count: { select: { schools: true, admins: true } } },
    }),
    prisma.user.count(),
    prisma.schoolModule.findMany({ select: { moduleKey: true, enabled: true } }),
    prisma.student.count(),
    prisma.transferRequest.count({ where: { status: 'PENDING' } }),
    getGenderStatsBySchool(),
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
    stats: {
      schools: schools.length,
      organizations: organizations.length,
      users,
      students,
      pendingTransfers,
    },
    genderBySchool: genderStats.schools || [],
    moduleStats,
    MODULES,
    MODULE_KEYS,
    success: req.query.success || null,
    error: req.query.error || null,
    smsConfigured: smsConfigured(),
    smsProvider: smsProvider(),
    smsTest: req.query.smsTest || null,
    smsReason: req.query.smsReason || null,
    smsSender: req.query.smsSender || null,
    educationCycleOptions: EDUCATION_CYCLE_OPTIONS,
    educationCycleLabels: CYCLE_LABELS,
    marketplaceTierOptions: MARKETPLACE_TIER_OPTIONS,
  });
}

function smsTestStatus(result) {
  if (result?.ok) return 'sent';
  if (['not_configured', 'no_phone', 'invalid_phone'].includes(result?.reason)) return 'skipped';
  return 'error';
}

async function sendTestSms(req, res) {
  const phone = String(req.body?.phone || '').trim();
  const schoolId = String(req.body?.schoolId || '').trim();
  let school = null;
  if (schoolId) {
    try {
      school = await prisma.school.findUnique({
        where: { id: schoolId },
        select: { id: true, name: true, smsSenderId: true },
      });
    } catch {
      school = null;
    }
  }

  const result = await sendConnectivityTestSms(phone, { school });
  const params = new URLSearchParams({ smsTest: smsTestStatus(result) });
  if (result?.reason) params.set('smsReason', String(result.reason).slice(0, 120));
  if (result?.sender || school) {
    params.set('smsSender', resolveSmsSender({ school }).slice(0, 20));
  }
  return res.redirect(`/admin/dashboard?${params.toString()}`);
}

async function modulesHub(req, res) {
  const schools = await loadSchoolsWithModules();
  const selectedId = req.query.school || schools[0]?.id;
  const selected = schools.find((s) => s.id === selectedId) || schools[0];

  res.render('admin/modules', {
    user: req.user,
    schools,
    selected,
    MODULES,
    MODULE_KEYS,
    marketplaceTierOptions: MARKETPLACE_TIER_OPTIONS,
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
    educationCycleOptions: EDUCATION_CYCLE_OPTIONS,
    marketplaceTierOptions: MARKETPLACE_TIER_OPTIONS,
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
    if (key === MARKETPLACE_MODULE) {
      await syncMarketplaceAfterModuleChange(id, enabled);
    }
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

  const redirectTo = safeInternalPath(req.body.redirect, `/admin/schools/${id}/modules`);
  res.redirect(`${redirectTo}?success=1`);
}

async function updateSchoolCycle(req, res) {
  const { id } = req.params;
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) return res.redirect('/admin/dashboard?error=school');

  const educationCycle = parseEducationCycle(req.body.educationCycle);
  await prisma.school.update({
    where: { id },
    data: { educationCycle },
  });
  await logAudit({
    action: 'school_cycle_update',
    entity: 'School',
    entityId: id,
    user: req.user,
    schoolId: id,
    details: { educationCycle },
    ip: req.ip,
  });

  const redirectTo = safeInternalPath(req.body.redirect, '/admin/dashboard');
  const sep = redirectTo.includes('?') ? '&' : '?';
  res.redirect(`${redirectTo}${sep}success=cycle`);
}

async function updateSchoolFeatured(req, res) {
  const { id } = req.params;
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) return res.redirect('/admin/dashboard?error=school');

  let tier = req.body.marketplaceTier != null
    ? parseMarketplaceTier(req.body.marketplaceTier)
    : null;
  if (!tier) {
    const publicFeatured = req.body.publicFeatured === '1' || req.body.publicFeatured === 'on' || req.body.publicFeatured === 'true';
    tier = publicFeatured ? 'PREMIUM' : 'STANDARD';
  }
  const result = await applyMarketplaceOffer(id, {
    tier,
    enableModule: tier !== 'NONE',
  });
  await logAudit({
    action: 'school_featured_update',
    entity: 'School',
    entityId: id,
    user: req.user,
    schoolId: id,
    details: { marketplaceTier: result.marketplaceTier, publicFeatured: result.publicFeatured },
    ip: req.ip,
  });

  const redirectTo = safeInternalPath(req.body.redirect, '/admin/dashboard');
  const sep = redirectTo.includes('?') ? '&' : '?';
  res.redirect(`${redirectTo}${sep}success=featured`);
}

async function enableAllModules(req, res) {
  const { id } = req.params;
  for (const key of MODULE_KEYS) {
    if (MODULES[key].addon) continue;
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

async function updateModulesMatrix(req, res) {
  const schools = await prisma.school.findMany({ select: { id: true } });
  for (const school of schools) {
    const changes = [];
    for (const key of MODULE_KEYS) {
      const enabled = MODULES[key].core ? true : req.body[`mod_${school.id}_${key}`] === 'on';
      await setModule(school.id, key, { enabled, locked: true });
      changes.push({ key, enabled });
      if (key === MARKETPLACE_MODULE) {
        await syncMarketplaceAfterModuleChange(school.id, enabled);
      }
    }
    await prisma.school.update({
      where: { id: school.id },
      data: { subscription: 'premium' },
    });
    await logAudit({
      action: 'school_modules_update',
      entity: 'SchoolModule',
      entityId: school.id,
      user: req.user,
      schoolId: school.id,
      details: { changes, matrix: true },
      ip: req.ip,
    });
  }
  res.redirect('/admin/modules?success=matrix');
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
    const group = await prisma.group.create({ data: { name } });
    await prisma.organization.create({
      data: {
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        groupId: group.id,
      },
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
    if (!password || String(password).length < 8) {
      return res.redirect('/admin/organizations?error=password');
    }

    const hashed = await hashPassword(password);
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
  let groupId = null;
  if (organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (org) {
      const synced = await ensureGroupForOrganization(org);
      groupId = synced.groupId;
    }
  }
  await prisma.school.update({
    where: { id: schoolId },
    data: {
      organizationId: organizationId || null,
      groupId,
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
    MODULE_KEYS,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function updatePlanModules(req, res) {
  const planId = parseInt(req.params.id, 10);
  const selected = [].concat(req.body.features || []).filter(Boolean);
  const result = await updatePlanFeatures(planId, selected);
  if (!result.ok) return res.redirect('/admin/plans?error=plan');

  await logAudit({
    action: 'plan_modules_update',
    entity: 'SubscriptionPlan',
    entityId: String(planId),
    user: req.user,
    details: { features: result.plan.features },
    ip: req.ip,
  });

  res.redirect('/admin/plans?success=modules');
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

async function startSchoolAssist(req, res) {
  const result = await beginSchoolAssist(req, res);
  if (result.status === 403) return res.status(403).send('Forbidden');
  if (!result.ok) return res.redirect('/admin/dashboard?error=assist');
  return res.redirect(result.redirect);
}

async function startGroupAssist(req, res) {
  const result = await beginGroupAssist(req, res);
  if (result.status === 403) return res.status(403).send('Forbidden');
  if (!result.ok) return res.redirect('/admin/organizations?error=assist');
  return res.redirect(result.redirect);
}

async function exitAssist(req, res) {
  const result = await stopAssist(req, res);
  return res.redirect(result.redirect);
}

module.exports = {
  dashboard,
  sendTestSms,
  modulesHub,
  schoolModules,
  updateSchoolModules,
  enableAllModules,
  updateModulesMatrix,
  bootstrapPremiumPlatform,
  organizations,
  createOrganization,
  createOrgAdmin,
  assignSchoolToOrg,
  plansPage,
  activatePlanModules,
  updatePlanModules,
  startSchoolAssist,
  startGroupAssist,
  exitAssist,
  updateSchoolCycle,
  updateSchoolFeatured,
};
