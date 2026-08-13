const { getPlansForLanding, PLANS } = require('../src/config/plans');
const { planIncludesFeature } = require('../src/utils/plans');

describe('Plans config', () => {
  test('getPlansForLanding returns school and group plans', () => {
    const { plans, moduleList } = getPlansForLanding();
    expect(plans.length).toBe(4);
    expect(moduleList.length).toBeGreaterThan(10);
    expect(plans.find((p) => p.id === 'groupe')?.isGroup).toBe(true);
  });

  test('essentiel is free and includes core modules', () => {
    const essentiel = PLANS.essentiel;
    expect(essentiel.price).toBe(0);
    expect(essentiel.modules).toContain('payments');
    expect(essentiel.modules).toContain('grades');
    expect(essentiel.modules).not.toContain('accounting');
  });

  test('pro includes accounting and hr', () => {
    const pro = PLANS.pro;
    expect(pro.modules).toContain('accounting');
    expect(pro.modules).toContain('hr');
    expect(pro.modules).not.toContain('multi_campus');
  });

  test('groupe includes multi_campus', () => {
    expect(PLANS.groupe.modules).toContain('multi_campus');
    expect(PLANS.groupe.perks.length).toBeGreaterThan(3);
  });
});

describe('planIncludesFeature', () => {
  const essentiel = { name: 'Essentiel', features: PLANS.essentiel.modules };

  test('allows core modules even if omitted from features', () => {
    expect(planIncludesFeature({ features: [] }, 'payments')).toBe(true);
    expect(planIncludesFeature({ features: [] }, 'grades')).toBe(true);
  });

  test('blocks modules outside the plan', () => {
    expect(planIncludesFeature(essentiel, 'hr')).toBe(false);
    expect(planIncludesFeature(essentiel, 'accounting')).toBe(false);
  });

  test('allows modules listed in features', () => {
    expect(planIncludesFeature(essentiel, 'chat')).toBe(true);
    expect(planIncludesFeature(essentiel, 'bulletins')).toBe(true);
  });

  test('allows everything when no plan is assigned', () => {
    expect(planIncludesFeature(null, 'hr')).toBe(true);
  });
});
