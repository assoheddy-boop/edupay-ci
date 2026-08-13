const prisma = require('../config/database');
const { MODULES, MODULE_KEYS } = require('../config/modules');
const { PLANS, PLAN_IDS, PLAN_NAME_BY_ID, planSeedPrice } = require('../config/plans');
const { setModule, initSchoolModules } = require('./modules');

function planIncludesFeature(plan, moduleKey) {
  if (!plan) return true;
  if (MODULES[moduleKey]?.core) return true;
  const features = plan.features || [];
  return features.includes(moduleKey);
}

async function ensureSubscriptionPlans() {
  const plans = [];
  for (const id of PLAN_IDS) {
    const def = PLANS[id];
    let row = await prisma.subscriptionPlan.findFirst({ where: { name: def.name } });
    if (!row) {
      row = await prisma.subscriptionPlan.create({
        data: {
          name: def.name,
          price: planSeedPrice(def),
          features: def.modules,
        },
      });
    } else if (!row.features?.length) {
      row = await prisma.subscriptionPlan.update({
        where: { id: row.id },
        data: { features: def.modules, price: planSeedPrice(def) },
      });
    }
    plans.push({ ...row, slug: id });
  }
  return plans;
}

async function findPlanBySlug(slug) {
  const name = PLAN_NAME_BY_ID[slug];
  if (!name) return null;
  await ensureSubscriptionPlans();
  return prisma.subscriptionPlan.findFirst({ where: { name } });
}

async function getSchoolPlan(schoolId) {
  if (!schoolId) return null;
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    include: { plan: true },
  });
  return school?.plan || null;
}

async function syncSchoolModulesToPlan(schoolId, plan) {
  await initSchoolModules(schoolId);
  const features = new Set(plan?.features || []);
  for (const key of MODULE_KEYS) {
    const enabled = MODULES[key].core || features.has(key);
    await setModule(schoolId, key, { enabled, locked: true });
  }
}

async function assignPlanToSchool(schoolId, planId) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: parseInt(planId, 10) } });
  if (!plan) return { ok: false, error: 'plan' };

  const slug = Object.keys(PLAN_NAME_BY_ID).find((id) => PLAN_NAME_BY_ID[id] === plan.name) || 'premium';

  await prisma.school.update({
    where: { id: schoolId },
    data: {
      planId: plan.id,
      subscription: slug,
    },
  });

  await syncSchoolModulesToPlan(schoolId, plan);
  return { ok: true, plan };
}

module.exports = {
  planIncludesFeature,
  ensureSubscriptionPlans,
  findPlanBySlug,
  getSchoolPlan,
  syncSchoolModulesToPlan,
  assignPlanToSchool,
};
