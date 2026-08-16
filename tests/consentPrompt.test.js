jest.mock('../services/ConsentService', () => ({
  needsFirstLoginConsent: jest.fn(),
  upsertConsent: jest.fn(),
  CONSENT_LABELS: { DATA_PROCESSING: 'Traitement des données personnelles' },
  CONSENT_HINTS: { DATA_PROCESSING: 'hint' },
}));

const { needsFirstLoginConsent, upsertConsent } = require('../services/ConsentService');
const { attachConsentPrompt, skipConsentPromptPath } = require('../src/middleware/consentPrompt');
const { handleFirstLoginConsent } = require('../src/controllers/parentController');

function mockRes() {
  return {
    locals: {},
    cookies: {},
    redirectTo: null,
    cookie: jest.fn(),
    redirect(url) { this.redirectTo = url; },
  };
}

describe('attachConsentPrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('skips non-parent roles', async () => {
    const req = { user: { role: 'TEACHER', id: 't1' }, path: '/dashboard', cookies: {} };
    const res = mockRes();
    const next = jest.fn();
    attachConsentPrompt(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(needsFirstLoginConsent).not.toHaveBeenCalled();
    expect(res.locals.needsConsentPrompt).toBe(false);
  });

  test('skips the privacy page', () => {
    expect(skipConsentPromptPath({ path: '/privacy' })).toBe(true);
    expect(skipConsentPromptPath({ path: '/dashboard' })).toBe(false);
  });

  test('sets needsConsentPrompt when the parent has no records', async () => {
    needsFirstLoginConsent.mockResolvedValue(true);
    const req = { user: { role: 'PARENT', id: 'p1' }, path: '/dashboard', cookies: {} };
    const res = mockRes();
    const next = jest.fn();
    attachConsentPrompt(req, res, next);
    await new Promise((resolve) => setImmediate(resolve));
    expect(res.locals.needsConsentPrompt).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  test('does not prompt when the dismiss cookie is set', () => {
    const req = {
      user: { role: 'PARENT', id: 'p1' },
      path: '/dashboard',
      cookies: { consent_prompt_done: '1' },
    };
    const res = mockRes();
    const next = jest.fn();
    attachConsentPrompt(req, res, next);
    expect(needsFirstLoginConsent).not.toHaveBeenCalled();
    expect(res.locals.needsConsentPrompt).toBe(false);
  });
});

describe('handleFirstLoginConsent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('accept grants DATA_PROCESSING and does not block', async () => {
    upsertConsent.mockResolvedValue({ ok: true, consent: { status: 'GRANTED' } });
    const req = {
      user: { id: 'p1' },
      body: { action: 'accept' },
      get: () => 'http://localhost/parent/dashboard',
      hostname: 'localhost',
    };
    const res = mockRes();
    await handleFirstLoginConsent(req, res);
    expect(upsertConsent).toHaveBeenCalledWith('p1', 'DATA_PROCESSING', 'GRANTED');
    expect(res.cookie).toHaveBeenCalled();
    expect(res.redirectTo).toMatch(/parent/);
  });

  test('later writes PENDING so existing parents are not nagged forever', async () => {
    upsertConsent.mockResolvedValue({ ok: true, consent: { status: 'PENDING' } });
    const req = {
      user: { id: 'p1' },
      body: { action: 'later' },
      get: () => null,
      hostname: 'localhost',
    };
    const res = mockRes();
    await handleFirstLoginConsent(req, res);
    expect(upsertConsent).toHaveBeenCalledWith('p1', 'DATA_PROCESSING', 'PENDING');
    expect(res.redirectTo).toBe('/parent/dashboard');
  });
});
