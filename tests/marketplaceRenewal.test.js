const {
  renewalClientReference,
  formatFcfa,
  manualWavePaymentUrl,
  buildRenewalPaymentLink,
} = require('../src/utils/marketplaceWavePayment');

describe('marketplaceWavePayment', () => {
  const prevWave = process.env.EDUCONNECT_WAVE_NUMBER;

  afterEach(() => {
    if (prevWave === undefined) delete process.env.EDUCONNECT_WAVE_NUMBER;
    else process.env.EDUCONNECT_WAVE_NUMBER = prevWave;
  });

  test('formatFcfa uses French grouping', () => {
    expect(formatFcfa(50000)).toMatch(/50.*000 FCFA/);
  });

  test('renewalClientReference is stable per school/year', () => {
    const ref = renewalClientReference('clxyz123456789');
    expect(ref).toMatch(/^MP-\d{4}-/);
  });

  test('buildRenewalPaymentLink includes renewal page', () => {
    const link = buildRenewalPaymentLink({
      id: 'school-1',
      marketplaceTier: 'PREMIUM',
    });
    expect(link.amount).toBe(150000);
    expect(link.renewalPageUrl).toContain('/school/marketplace-renewal');
    expect(link.payPageUrl).toContain('/pay');
  });

  test('manualWavePaymentUrl uses merchant number', () => {
    process.env.EDUCONNECT_WAVE_NUMBER = '07 07 07 07 07';
    const url = manualWavePaymentUrl(50000);
    expect(url).toContain('pay.wave.com');
    expect(url).toContain('amount=50000');
  });
});

describe('marketplaceRenewalEmail', () => {
  const { marketplaceRenewalEmailText, marketplaceRenewalEmailSubject } = require('../src/utils/marketplaceRenewalEmail');

  test('French email mentions tier and renewal page', () => {
    const text = marketplaceRenewalEmailText({
      name: 'Collège Demo',
      marketplaceTier: 'STANDARD',
      marketplaceExpiresAt: new Date('2026-12-01'),
      id: 'abc123',
    }, { daysLeft: 20 });
    expect(text).toContain('Collège Demo');
    expect(text).toContain('Standard');
    expect(text).toContain('/school/marketplace-renewal');
    expect(text).toContain('Wave');
    expect(marketplaceRenewalEmailSubject({ name: 'Collège Demo' })).toContain('Renouvellement');
  });
});

describe('marketplaceRenewalReminders helpers', () => {
  const { reminderCooldownExpired } = require('../src/jobs/marketplaceRenewalReminders');

  test('reminderCooldownExpired allows first send', () => {
    expect(reminderCooldownExpired(null)).toBe(true);
  });

  test('reminderCooldownExpired blocks recent send', () => {
    const recent = new Date(Date.now() - 2 * 86400000);
    expect(reminderCooldownExpired(recent)).toBe(false);
  });
});

describe('publishedWhere expiration', () => {
  const { publishedWhere } = require('../src/utils/marketplaceAddon');

  test('excludes expired marketplace subscriptions', () => {
    const where = publishedWhere();
    expect(where.AND).toBeDefined();
    expect(where.AND[0].OR).toEqual(
      expect.arrayContaining([
        { marketplaceExpiresAt: null },
        expect.objectContaining({ marketplaceExpiresAt: expect.objectContaining({ gt: expect.any(Date) }) }),
      ]),
    );
  });
});
