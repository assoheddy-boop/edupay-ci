jest.mock('../src/config/database', () => ({
  consent: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
}));

const prisma = require('../src/config/database');
const {
  CONSENT_TYPES,
  normalizeType,
  normalizeStatus,
  listConsents,
  upsertConsent,
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
