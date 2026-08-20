const crypto = require('crypto');
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
const { revokeUserRefreshTokens } = require('../utils/refreshToken');
const { quoteSummary } = require('../utils/quoteAnswers');
const {
  MARKETPLACE_MODULE,
  MARKETPLACE_TIER_OPTIONS,
  parseMarketplaceTier,
  isLiveTier,
  applyMarketplaceOffer,
  syncMarketplaceAfterModuleChange,
} = require('../utils/marketplaceAddon');
const { marketplaceSubscriptionStatus, RENEWAL_WARNING_DAYS } = require('../utils/marketplaceSubscription');

const USER_ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  ORGANIZATION_ADMIN: 'Admin groupe',
  SCHOOL_ADMIN: 'Direction',
  PARENT: 'Parent',
  TEACHER: 'Enseignant',
  STUDENT: 'Élève',
};

const QUOTE_STATUS_LABELS = {
  pending: 'En attente',
  activation_requested: 'Activation demandée',
};

function isOn(value) {
  if (Array.isArray(value)) return value.some(isOn);
  if (value === true || value === 1) return true;
  const raw = String(value || '').toLowerCase();
  return raw === 'on' || raw === '1' || raw === 'true' || raw === 'oui' || raw === 'yes';
}

function wantsJson(req) {
  return req.method === 'PATCH' || Boolean(req.is && req.is('json'));
}

function generateAdminTempPassword() {
  return `EduA-${crypto.randomBytes(6).toString('base64url')}!`;
}

function userSchoolLabel(user) {
  if (user.school?.name) return user.school.name;
  if (user.teacher?.school?.name) return user.teacher.school.name;
  if (user.organizationAdmin?.organization?.name) return user.organizationAdmin.organization.name;
  return '—';
}

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
  const [schools, organizations, users, moduleRows, students, pendingTransfers, genderStats, pendingQuotes] = await Promise.all([
    loadSchoolsWithModules(),
    prisma.organization.findMany({
      include: { _count: { select: { schools: true, admins: true } } },
    }),
    prisma.user.count(),
    prisma.schoolModule.findMany({ select: { moduleKey: true, enabled: true } }),
    prisma.student.count(),
    prisma.transferRequest.count({ where: { status: 'PENDING' } }),
    getGenderStatsBySchool(),
    (prisma.quoteRequest?.count
      ? prisma.quoteRequest.count({ where: { status: { in: ['pending', 'activation_requested'] } } })
      : Promise.resolve(0)
    ).catch(() => 0),
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
      pendingQuotes,
      marketplaceLive: schools.filter((s) => s.publicPortalEnabled && s.slug && isLiveTier(s.marketplaceTier)).length,
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

function schoolFormLocals(school, extra = {}) {
  return {
    user: extra.user,
    school,
    MODULES,
    MODULE_KEYS,
    educationCycleOptions: EDUCATION_CYCLE_OPTIONS,
    marketplaceTierOptions: MARKETPLACE_TIER_OPTIONS,
    success: extra.success || null,
    error: extra.error || null,
  };
}

async function schoolsList(req, res) {
  const schools = await loadSchoolsWithModules();
  res.render('admin/schools', {
    user: req.user,
    schools,
    MODULES,
    MODULE_KEYS,
    educationCycleOptions: EDUCATION_CYCLE_OPTIONS,
    educationCycleLabels: CYCLE_LABELS,
    marketplaceTierOptions: MARKETPLACE_TIER_OPTIONS,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function schoolDetail(req, res) {
  const { id } = req.params;
  const school = await prisma.school.findUnique({
    where: { id },
    include: {
      admin: true,
      organization: true,
      plan: true,
      modules: true,
      _count: { select: { classes: true, students: true } },
    },
  });
  if (!school) return res.redirect('/admin/schools?error=school');

  const modules = await getModuleMap(id);
  res.render('admin/school', schoolFormLocals({ ...school, modules }, {
    user: req.user,
    success: req.query.success || null,
    error: req.query.error || null,
  }));
}

async function updateSchool(req, res) {
  const { id } = req.params;
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) {
    if (wantsJson(req)) return res.status(404).json({ error: 'École introuvable' });
    return res.redirect('/admin/schools?error=school');
  }

  const data = {};
  if (req.body.educationCycle != null) {
    data.educationCycle = parseEducationCycle(req.body.educationCycle);
  }
  if (req.body.city != null) {
    const city = String(req.body.city).trim().slice(0, 80);
    if (city) data.city = city;
  }
  if (req.body.smsSenderId != null) {
    const sender = String(req.body.smsSenderId).trim().slice(0, 20);
    data.smsSenderId = sender || null;
  }

  const hasTier = req.body.marketplaceTier != null && String(req.body.marketplaceTier).trim() !== '';
  const hasPublish = req.body.publicPortalEnabled != null;
  const hasFeatured = req.body.publicFeatured != null;
  if (hasPublish && !hasTier) {
    data.publicPortalEnabled = isOn(req.body.publicPortalEnabled);
  }

  if (Object.keys(data).length) {
    await prisma.school.update({ where: { id }, data });
  }

  const saveModules = isOn(req.body.saveModules)
    || Object.keys(req.body || {}).some((key) => key.startsWith('mod_'));
  if (saveModules) {
    for (const key of MODULE_KEYS) {
      if (key === MARKETPLACE_MODULE) continue;
      const enabled = MODULES[key].core ? true : isOn(req.body[`mod_${key}`]);
      await setModule(id, key, { enabled, locked: true });
    }
  }

  let marketplaceResult = null;
  if (hasTier || hasFeatured || hasPublish) {
    let tier = hasTier
      ? parseMarketplaceTier(req.body.marketplaceTier)
      : parseMarketplaceTier(school.marketplaceTier);
    if (!hasTier && hasFeatured) {
      tier = isOn(req.body.publicFeatured) ? 'PREMIUM' : (tier === 'VIP' ? 'VIP' : 'STANDARD');
    }
    marketplaceResult = await applyMarketplaceOffer(id, {
      tier,
      publish: hasPublish ? isOn(req.body.publicPortalEnabled) : undefined,
      enableModule: saveModules ? isOn(req.body[`mod_${MARKETPLACE_MODULE}`]) : undefined,
    });
  }

  await logAudit({
    action: 'school_admin_update',
    entity: 'School',
    entityId: id,
    user: req.user,
    schoolId: id,
    details: {
      educationCycle: data.educationCycle || school.educationCycle,
      marketplaceTier: marketplaceResult?.marketplaceTier || school.marketplaceTier,
      publicPortalEnabled: hasPublish ? isOn(req.body.publicPortalEnabled) : school.publicPortalEnabled,
    },
    ip: req.ip,
  });

  const payload = {
    ok: true,
    educationCycle: data.educationCycle || school.educationCycle,
    marketplaceTier: marketplaceResult?.marketplaceTier || school.marketplaceTier,
    publicFeatured: marketplaceResult?.publicFeatured ?? school.publicFeatured,
    publicPortalEnabled: hasPublish ? isOn(req.body.publicPortalEnabled) : school.publicPortalEnabled,
  };
  if (wantsJson(req)) return res.json(payload);

  const redirectTo = safeInternalPath(req.body.redirect, `/admin/schools/${id}`);
  const sep = redirectTo.includes('?') ? '&' : '?';
  return res.redirect(`${redirectTo}${sep}success=saved`);
}

async function usersPage(req, res) {
  const q = String(req.query.q || req.query.email || '').trim().slice(0, 160);
  const where = q
    ? { email: { contains: q, mode: 'insensitive' } }
    : {};
  let users = [];
  try {
    users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true,
        school: { select: { id: true, name: true } },
        teacher: { select: { school: { select: { id: true, name: true } } } },
        organizationAdmin: { select: { organization: { select: { id: true, name: true } } } },
      },
      orderBy: { email: 'asc' },
      take: 100,
    });
  } catch {
    users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        createdAt: true,
        school: { select: { id: true, name: true } },
        teacher: { select: { school: { select: { id: true, name: true } } } },
        organizationAdmin: { select: { organization: { select: { id: true, name: true } } } },
      },
      orderBy: { email: 'asc' },
      take: 100,
    });
    users = users.map((u) => ({ ...u, isActive: true }));
  }

  res.render('admin/users', {
    user: req.user,
    users: users.map((u) => ({ ...u, schoolLabel: userSchoolLabel(u) })),
    q,
    roleLabels: USER_ROLE_LABELS,
    success: req.query.success || null,
    error: req.query.error || null,
    tempPassword: null,
    resetEmail: null,
  });
}

async function resetUserPassword(req, res) {
  const { id } = req.params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, firstName: true, lastName: true },
  });
  if (!target) return res.redirect('/admin/users?error=user');

  const tempPassword = generateAdminTempPassword();
  const hashed = await hashPassword(tempPassword);
  await prisma.user.update({ where: { id }, data: { password: hashed } });
  try {
    await revokeUserRefreshTokens(id);
  } catch {
    /* refresh table may be empty in tests */
  }
  await logAudit({
    action: 'user_password_reset',
    entity: 'User',
    entityId: id,
    user: req.user,
    details: { email: target.email },
    ip: req.ip,
    sensitive: true,
  });

  const q = String(req.body.q || '').trim().slice(0, 160);
  const where = q ? { email: { contains: q, mode: 'insensitive' } } : {};
  let users = [];
  try {
    users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true,
        school: { select: { id: true, name: true } },
        teacher: { select: { school: { select: { id: true, name: true } } } },
        organizationAdmin: { select: { organization: { select: { id: true, name: true } } } },
      },
      orderBy: { email: 'asc' },
      take: 100,
    });
  } catch {
    users = [];
  }

  res.render('admin/users', {
    user: req.user,
    users: users.map((u) => ({ ...u, schoolLabel: userSchoolLabel(u) })),
    q,
    roleLabels: USER_ROLE_LABELS,
    success: 'reset',
    error: null,
    tempPassword,
    resetEmail: target.email,
  });
}

async function setUserActive(req, res, active) {
  const { id } = req.params;
  if (id === req.user?.id) {
    return res.redirect('/admin/users?error=self');
  }
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true },
  });
  if (!target) return res.redirect('/admin/users?error=user');
  if (target.role === 'SUPER_ADMIN') {
    return res.redirect('/admin/users?error=super');
  }

  try {
    await prisma.user.update({ where: { id }, data: { isActive: active } });
  } catch {
    return res.redirect('/admin/users?error=field');
  }
  if (!active) {
    try {
      await revokeUserRefreshTokens(id);
    } catch {
      /* ignore */
    }
  }
  await logAudit({
    action: active ? 'user_activate' : 'user_deactivate',
    entity: 'User',
    entityId: id,
    user: req.user,
    details: { email: target.email },
    ip: req.ip,
    sensitive: true,
  });
  return res.redirect(`/admin/users?success=${active ? 'activated' : 'deactivated'}`);
}

async function deactivateUser(req, res) {
  return setUserActive(req, res, false);
}

async function activateUser(req, res) {
  return setUserActive(req, res, true);
}

async function quotesPage(req, res) {
  const status = String(req.query.status || '').trim();
  const where = status
    ? { status }
    : { status: { in: ['pending', 'activation_requested'] } };
  const quotes = await prisma.quoteRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.render('admin/quotes', {
    user: req.user,
    quotes,
    statusFilter: status,
    statusLabels: QUOTE_STATUS_LABELS,
    success: req.query.success || null,
  });
}

async function quoteDetail(req, res) {
  const quote = await prisma.quoteRequest.findUnique({ where: { id: req.params.id } });
  if (!quote) return res.redirect('/admin/quotes?error=quote');
  const answers = quote.answers && typeof quote.answers === 'object' ? quote.answers : {};
  res.render('admin/quote-detail', {
    user: req.user,
    quote,
    answers,
    summary: quoteSummary(answers),
    statusLabels: QUOTE_STATUS_LABELS,
    formatMoney: require('../middleware/currency').formatMoney,
  });
}

function marketplaceOnEcoles(school) {
  return Boolean(
    school.publicPortalEnabled
    && school.slug
    && isLiveTier(school.marketplaceTier)
    && school.moduleMap?.[MARKETPLACE_MODULE]?.enabled,
  );
}

async function marketplacePage(req, res) {
  const schools = await loadSchoolsWithModules();
  const rows = schools.map((s) => {
    const subscription = marketplaceSubscriptionStatus(s);
    return { ...s, onEcoles: marketplaceOnEcoles(s), subscription };
  });
  const expiring = rows.filter((s) => s.subscription.state === 'expiring');
  const expired = rows.filter((s) => s.subscription.state === 'expired');
  res.render('admin/marketplace', {
    user: req.user,
    schools: rows,
    expiring,
    expired,
    renewalWarningDays: RENEWAL_WARNING_DAYS,
    marketplaceTierOptions: MARKETPLACE_TIER_OPTIONS.filter((opt) => opt.value !== 'NONE'),
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function renewMarketplace(req, res) {
  const { id } = req.params;
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) return res.redirect('/admin/marketplace?error=school');
  const tier = parseMarketplaceTier(school.marketplaceTier);
  if (!isLiveTier(tier)) {
    return res.redirect('/admin/marketplace?error=tier');
  }
  await applyMarketplaceOffer(id, {
    tier,
    enableModule: true,
    renew: true,
  });
  await logAudit({
    action: 'school_marketplace_renew',
    entity: 'School',
    entityId: id,
    user: req.user,
    schoolId: id,
    ip: req.ip,
  });
  return res.redirect('/admin/marketplace?success=renewed');
}

async function publishMarketplace(req, res) {
  const { id } = req.params;
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) return res.redirect('/admin/marketplace?error=school');
  const tier = parseMarketplaceTier(school.marketplaceTier);
  await applyMarketplaceOffer(id, {
    tier: tier === 'NONE' ? 'STANDARD' : tier,
    publish: true,
    enableModule: true,
  });
  await logAudit({
    action: 'school_marketplace_publish',
    entity: 'School',
    entityId: id,
    user: req.user,
    schoolId: id,
    ip: req.ip,
  });
  return res.redirect('/admin/marketplace?success=published');
}

async function unpublishMarketplace(req, res) {
  const { id } = req.params;
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) return res.redirect('/admin/marketplace?error=school');
  await applyMarketplaceOffer(id, {
    tier: parseMarketplaceTier(school.marketplaceTier),
    publish: false,
  });
  await logAudit({
    action: 'school_marketplace_unpublish',
    entity: 'School',
    entityId: id,
    user: req.user,
    schoolId: id,
    ip: req.ip,
  });
  return res.redirect('/admin/marketplace?success=unpublished');
}

async function setMarketplaceTier(req, res) {
  const { id } = req.params;
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) return res.redirect('/admin/marketplace?error=school');
  const tier = parseMarketplaceTier(req.body.marketplaceTier);
  await applyMarketplaceOffer(id, {
    tier,
    enableModule: tier !== 'NONE',
  });
  await logAudit({
    action: 'school_featured_update',
    entity: 'School',
    entityId: id,
    user: req.user,
    schoolId: id,
    details: { marketplaceTier: tier },
    ip: req.ip,
  });
  return res.redirect('/admin/marketplace?success=tier');
}

async function toggleMarketplaceFeatured(req, res) {
  const { id } = req.params;
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) return res.redirect('/admin/marketplace?error=school');
  const featured = req.body.publicFeatured === '1' || req.body.publicFeatured === 'on' || req.body.publicFeatured === 'true';
  await prisma.school.update({
    where: { id },
    data: { publicFeatured: featured },
  });
  await logAudit({
    action: 'school_featured_update',
    entity: 'School',
    entityId: id,
    user: req.user,
    schoolId: id,
    details: { publicFeatured: featured },
    ip: req.ip,
  });
  return res.redirect('/admin/marketplace?success=featured');
}

async function bulkRenewMarketplace(req, res) {
  const raw = req.body.schoolIds;
  const ids = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  let renewed = 0;
  for (const id of ids) {
    const school = await prisma.school.findUnique({ where: { id: String(id) } });
    if (!school) continue;
    const tier = parseMarketplaceTier(school.marketplaceTier);
    if (!isLiveTier(tier)) continue;
    await applyMarketplaceOffer(id, { tier, enableModule: true, renew: true });
    await logAudit({
      action: 'school_marketplace_renew',
      entity: 'School',
      entityId: id,
      user: req.user,
      schoolId: id,
      details: { bulk: true },
      ip: req.ip,
    });
    renewed += 1;
  }
  return res.redirect(`/admin/marketplace?success=bulk_renewed&count=${renewed}`);
}

async function sendMarketplaceReminder(req, res) {
  const { id } = req.params;
  const school = await prisma.school.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      marketplaceTier: true,
      marketplaceExpiresAt: true,
      marketplaceRenewalReminderAt: true,
      admin: { select: { email: true, firstName: true, lastName: true } },
    },
  });
  if (!school) return res.redirect('/admin/marketplace?error=school');
  const { sendMarketplaceRenewalReminder } = require('../jobs/marketplaceRenewalReminders');
  const result = await sendMarketplaceRenewalReminder(school);
  if (!result.ok && !result.skip) {
    return res.redirect('/admin/marketplace?error=reminder');
  }
  await logAudit({
    action: 'school_marketplace_reminder',
    entity: 'School',
    entityId: id,
    user: req.user,
    schoolId: id,
    ip: req.ip,
  });
  return res.redirect('/admin/marketplace?success=reminder');
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
  schoolsList,
  schoolDetail,
  updateSchool,
  usersPage,
  resetUserPassword,
  deactivateUser,
  activateUser,
  quotesPage,
  quoteDetail,
  marketplacePage,
  publishMarketplace,
  unpublishMarketplace,
  setMarketplaceTier,
  renewMarketplace,
  bulkRenewMarketplace,
  toggleMarketplaceFeatured,
  sendMarketplaceReminder,
};
