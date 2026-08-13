const prisma = require('../config/database');
const { MODULES, MODULE_KEYS } = require('../config/modules');
const { PREMIUM_PLANS } = require('../middleware/premium');

async function initSchoolModules(schoolId) {
  const existing = await prisma.schoolModule.findMany({ where: { schoolId } });
  if (existing.length > 0) return;

  await prisma.schoolModule.createMany({
    data: MODULE_KEYS.map((key) => ({
      schoolId,
      moduleKey: key,
      enabled: MODULES[key].default,
      locked: true,
    })),
  });
}

async function bootstrapPremiumPlatform() {
  await prisma.school.updateMany({ data: { subscription: 'premium' } });

  const schools = await prisma.school.findMany({ select: { id: true } });
  for (const { id } of schools) {
    await initSchoolModules(id);
    for (const key of MODULE_KEYS) {
      const enabled = MODULES[key].core ? true : true;
      await setModule(id, key, { enabled, locked: true });
    }
  }

  return schools.length;
}

async function getModuleMap(schoolId) {
  if (!schoolId) return {};
  await initSchoolModules(schoolId);
  const rows = await prisma.schoolModule.findMany({ where: { schoolId } });
  const map = {};
  MODULE_KEYS.forEach((key) => {
    const row = rows.find((r) => r.moduleKey === key);
    map[key] = {
      enabled: row?.enabled ?? MODULES[key].default,
      locked: row?.locked ?? true,
      ...MODULES[key],
    };
  });
  return map;
}

function isEnabled(map, key) {
  if (!map || !map[key]) return MODULES[key]?.default ?? false;
  return map[key].enabled;
}

async function setModule(schoolId, moduleKey, { enabled, locked }) {
  await prisma.schoolModule.upsert({
    where: { schoolId_moduleKey: { schoolId, moduleKey } },
    create: { schoolId, moduleKey, enabled: enabled ?? true, locked: locked ?? true },
    update: {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(locked !== undefined ? { locked } : {}),
    },
  });
}

async function initFinanceDefaults(schoolId) {
  const count = await prisma.financeAccount.count({ where: { schoolId } });
  if (count > 0) return;

  await prisma.financeAccount.createMany({
    data: [
      { schoolId, name: 'Caisse Wave', type: 'WAVE', balance: 0 },
      { schoolId, name: 'Orange Money', type: 'ORANGE_MONEY', balance: 0 },
      { schoolId, name: 'Espèces', type: 'CASH', balance: 0 },
    ],
  });

  await prisma.expenseCategory.createMany({
    data: [
      { schoolId, name: 'Salaires' },
      { schoolId, name: 'Loyer & charges' },
      { schoolId, name: 'Fournitures' },
      { schoolId, name: 'Cantine' },
      { schoolId, name: 'Transport' },
      { schoolId, name: 'Autre' },
    ],
  });
}

module.exports = {
  initSchoolModules,
  bootstrapPremiumPlatform,
  getModuleMap,
  isEnabled,
  setModule,
  initFinanceDefaults,
  PREMIUM_PLANS,
};
