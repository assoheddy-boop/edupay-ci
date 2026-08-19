const prisma = require('../config/database');
const { MODULES, MODULE_KEYS } = require('../config/modules');
const { PREMIUM_PLANS } = require('../middleware/premium');

async function initSchoolModules(schoolId) {
  const existing = await prisma.schoolModule.findMany({ where: { schoolId } });
  const have = new Set(existing.map((row) => row.moduleKey));
  const missing = MODULE_KEYS.filter((key) => !have.has(key));
  if (!missing.length) return;

  await prisma.schoolModule.createMany({
    data: missing.map((key) => ({
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
      if (MODULES[key].addon) continue;
      await setModule(id, key, { enabled: true, locked: true });
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

const DEFAULT_FINANCE_ACCOUNTS = [
  { name: 'Caisse Wave', type: 'WAVE' },
  { name: 'Orange Money', type: 'ORANGE_MONEY' },
  { name: 'Espèces', type: 'CASH' },
  { name: 'Banque', type: 'BANK' },
];

const DEFAULT_EXPENSE_CATEGORIES = [
  'Salaires',
  'Loyer & charges',
  'Fournitures',
  'Cantine',
  'Transport',
  'Autre',
];

const DEFAULT_INCOME_CATEGORIES = ['Scolarité', 'Cantine', 'Extras'];

async function initFinanceDefaults(schoolId) {
  const existingAccounts = await prisma.financeAccount.findMany({ where: { schoolId } });
  const haveType = new Set(existingAccounts.map((a) => a.type));
  const accountsToCreate = DEFAULT_FINANCE_ACCOUNTS
    .filter((a) => !haveType.has(a.type))
    .map((a) => ({ schoolId, name: a.name, type: a.type, balance: 0 }));
  if (accountsToCreate.length) {
    await prisma.financeAccount.createMany({ data: accountsToCreate });
  }

  const existingCats = await prisma.expenseCategory.findMany({ where: { schoolId } });
  const haveCat = new Set(existingCats.map((c) => `${c.kind || 'EXPENSE'}::${c.name}`));
  const catsToCreate = [
    ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ schoolId, name, kind: 'EXPENSE' })),
    ...DEFAULT_INCOME_CATEGORIES.map((name) => ({ schoolId, name, kind: 'INCOME' })),
  ].filter((c) => !haveCat.has(`${c.kind}::${c.name}`));
  if (catsToCreate.length) {
    await prisma.expenseCategory.createMany({ data: catsToCreate });
  }
}

module.exports = {
  initSchoolModules,
  bootstrapPremiumPlatform,
  getModuleMap,
  isEnabled,
  setModule,
  initFinanceDefaults,
  DEFAULT_FINANCE_ACCOUNTS,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  PREMIUM_PLANS,
};
