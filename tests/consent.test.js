jest.mock('../src/config/database', () => ({
  consent: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
  },
}));

const prisma = require('../src/config/database');
const {
  CONSENT_TYPES,
  normalizeType,
  normalizeStatus,
  listConsents,
  upsertConsent,
  isConsentPromptEnabled,
  hasConsentRecords,
  needsFirstLoginConsent,
} = require('../services/ConsentService');

describe('ConsentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('exposes the four consent types', () => {
    expect(CONSENT_TYPES).toEqual(['DATA_PROCESSING', 'PHOTOS', 'HEALTH', 'MARKETING']);
  });

  test('normalizeType accepts known types', () => {
    expect(normalizeType('photos')).toBe('PHOTOS');
    expect(normalizeType('UNKNOWN')).toBeNull();
  });

  test('normalizeStatus maps grant/revoke', () => {
    expect(normalizeStatus('grant')).toBe('GRANTED');
    expect(normalizeStatus('revoke')).toBe('REVOKED');
    expect(normalizeStatus('nope')).toBeNull();
  });

  test('listConsents fills PENDING placeholders', async () => {
    prisma.consent.findMany.mockResolvedValue([
      { id: 'c1', parentId: 'u1', type: 'PHOTOS', status: 'GRANTED', createdAt: new Date(), updatedAt: new Date() },
    ]);
    const list = await listConsents('u1');
    expect(list).toHaveLength(4);
    expect(list.find((c) => c.type === 'PHOTOS').status).toBe('GRANTED');
    expect(list.find((c) => c.type === 'HEALTH').status).toBe('PENDING');
    expect(list.find((c) => c.type === 'DATA_PROCESSING').id).toBeNull();
  });

  test('upsertConsent grants a type', async () => {
    prisma.consent.upsert.mockResolvedValue({
      id: 'c2',
      parentId: 'u1',
      type: 'MARKETING',
      status: 'GRANTED',
    });
    const result = await upsertConsent('u1', 'MARKETING', 'grant');
    expect(result.ok).toBe(true);
    expect(prisma.consent.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { parentId_type: { parentId: 'u1', type: 'MARKETING' } },
      create: { parentId: 'u1', type: 'MARKETING', status: 'GRANTED' },
      update: { status: 'GRANTED' },
    }));
  });

  test('upsertConsent revokes a type', async () => {
    prisma.consent.upsert.mockResolvedValue({
      id: 'c2',
      parentId: 'u1',
      type: 'HEALTH',
      status: 'REVOKED',
    });
    const result = await upsertConsent('u1', 'HEALTH', 'revoke');
    expect(result.ok).toBe(true);
    expect(result.consent.status).toBe('REVOKED');
  });

  test('upsertConsent rejects invalid type', async () => {
    const result = await upsertConsent('u1', 'COOKIES', 'grant');
    expect(result).toEqual({ ok: false, error: 'type' });
    expect(prisma.consent.upsert).not.toHaveBeenCalled();
  });
});

describe('first-login consent prompt', () => {
  const originalFlag = process.env.PARENT_CONSENT_PROMPT;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.PARENT_CONSENT_PROMPT;
    else process.env.PARENT_CONSENT_PROMPT = originalFlag;
  });

  test('isConsentPromptEnabled defaults to on', () => {
    delete process.env.PARENT_CONSENT_PROMPT;
    expect(isConsentPromptEnabled()).toBe(true);
  });

  test('isConsentPromptEnabled can be turned off', () => {
    process.env.PARENT_CONSENT_PROMPT = 'false';
    expect(isConsentPromptEnabled()).toBe(false);
  });

  test('hasConsentRecords is false when none exist', async () => {
    prisma.consent.count.mockResolvedValue(0);
    expect(await hasConsentRecords('u1')).toBe(false);
  });

  test('hasConsentRecords is true when a row exists', async () => {
    prisma.consent.count.mockResolvedValue(1);
    expect(await hasConsentRecords('u1')).toBe(true);
  });

  test('needsFirstLoginConsent is true only without records', async () => {
    delete process.env.PARENT_CONSENT_PROMPT;
    prisma.consent.count.mockResolvedValue(0);
    expect(await needsFirstLoginConsent('u1')).toBe(true);
    prisma.consent.count.mockResolvedValue(2);
    expect(await needsFirstLoginConsent('u1')).toBe(false);
  });

  test('needsFirstLoginConsent stays false when the flag is off', async () => {
    process.env.PARENT_CONSENT_PROMPT = '0';
    prisma.consent.count.mockResolvedValue(0);
    expect(await needsFirstLoginConsent('u1')).toBe(false);
    expect(prisma.consent.count).not.toHaveBeenCalled();
  });
});
