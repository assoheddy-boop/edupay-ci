const { getPlansForLanding, PLANS, displayPlanName } = require('../src/config/plans');
const { planIncludesFeature } = require('../src/utils/plans');

describe('Plans config', () => {
  test('getPlansForLanding returns only the commercial Pro plan', () => {
    const { plans, moduleList, commercialPlan } = getPlansForLanding();
    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe('pro');
    expect(plans[0].name).toBe('Pro');
    expect(plans[0].price).toBe(500000);
    expect(plans[0].displayPrice).toBe(500000);
    expect(moduleList.length).toBeGreaterThan(10);
    expect(commercialPlan.amount).toBe(500000);
  });

  test('essentiel is free and includes core modules', () => {
    const essentiel = PLANS.essentiel;
    expect(essentiel.price).toBe(0);
    expect(essentiel.modules).toContain('payments');
    expect(essentiel.modules).toContain('grades');
    expect(essentiel.modules).toContain('sms_official');
    expect(essentiel.modules).not.toContain('accounting');
  });

  test('pro includes accounting, hr and multi_campus', () => {
    const pro = PLANS.pro;
    expect(pro.modules).toContain('accounting');
    expect(pro.modules).toContain('hr');
    expect(pro.modules).toContain('multi_campus');
    expect(pro.price).toBe(500000);
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

describe('displayPlanName', () => {
  test('maps legacy internal names to Pro for school-facing copy', () => {
    expect(displayPlanName('Essentiel')).toBe('Pro');
    expect(displayPlanName('premium')).toBe('Pro');
    expect(displayPlanName('groupe')).toBe('Pro');
  });
});
