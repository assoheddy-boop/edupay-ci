jest.mock('../src/utils/plans', () => ({
  getSchoolPlan: jest.fn(),
  planIncludesFeature: jest.fn(),
}));

const { getSchoolPlan, planIncludesFeature } = require('../src/utils/plans');
const {
  hasPremium,
  requirePremium,
  resolvePremiumModule,
  PREMIUM_PLANS,
} = require('../src/middleware/premium');

function mockRes() {
  return {
    statusCode: null,
    view: null,
    status(code) { this.statusCode = code; return this; },
    render(view) { this.view = view; return this; },
  };
}

describe('resolvePremiumModule', () => {
  test('maps route feature names to module keys', () => {
    expect(resolvePremiumModule('Chat')).toBe('chat');
    expect(resolvePremiumModule('Bulletins PDF')).toBe('bulletins');
    expect(resolvePremiumModule('Statistiques')).toBe('stats');
    expect(resolvePremiumModule('Export Excel')).toBe('stats');
  });

  test('accepts module keys as-is', () => {
    expect(resolvePremiumModule('chat')).toBe('chat');
    expect(resolvePremiumModule('bulletins')).toBe('bulletins');
  });

  test('returns null for an empty name', () => {
    expect(resolvePremiumModule('')).toBeNull();
    expect(resolvePremiumModule(undefined)).toBeNull();
  });
});

describe('hasPremium', () => {
  test('treats paid plan slugs as premium', () => {
    expect(hasPremium('premium')).toBe(true);
    expect(hasPremium('pro')).toBe(true);
    expect(hasPremium('groupe')).toBe(true);
    expect(PREMIUM_PLANS).toContain('premium');
  });

  test('does not treat free or missing subscriptions as premium', () => {
    expect(hasPremium('essentiel')).toBe(false);
    expect(hasPremium('free')).toBe(false);
    expect(hasPremium(null)).toBe(false);
  });
});

describe('requirePremium', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('allows access when the school plan includes the mapped module', async () => {
    getSchoolPlan.mockResolvedValue({ features: ['chat'] });
    planIncludesFeature.mockReturnValue(true);
    const req = { user: { role: 'SCHOOL_ADMIN', school: { id: 'school-1' } } };
    const res = mockRes();
    const next = jest.fn();

    await requirePremium('Chat')(req, res, next);

    expect(getSchoolPlan).toHaveBeenCalledWith('school-1');
    expect(planIncludesFeature).toHaveBeenCalledWith({ features: ['chat'] }, 'chat');
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  test('denies access when the plan does not include the module', async () => {
    getSchoolPlan.mockResolvedValue({ features: [] });
    planIncludesFeature.mockReturnValue(false);
    const req = { user: { role: 'SCHOOL_ADMIN', school: { id: 'school-1' } } };
    const res = mockRes();
    const next = jest.fn();

    await requirePremium('Export Excel')(req, res, next);

    expect(planIncludesFeature).toHaveBeenCalledWith({ features: [] }, 'stats');
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.view).toBe('school/module-disabled');
  });
});
