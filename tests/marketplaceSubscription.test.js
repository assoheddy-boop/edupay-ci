const {
  marketplaceSubscriptionStatus,
  subscriptionDatesForTierChange,
  addOneYear,
  RENEWAL_WARNING_DAYS,
} = require('../src/utils/marketplaceSubscription');

describe('marketplaceSubscription', () => {
  test('RENEWAL_WARNING_DAYS is 30', () => {
    expect(RENEWAL_WARNING_DAYS).toBe(30);
  });

  test('flags expiring subscription within 30 days', () => {
    const in20Days = new Date();
    in20Days.setDate(in20Days.getDate() + 20);
    const status = marketplaceSubscriptionStatus({
      marketplaceTier: 'PREMIUM',
      marketplaceExpiresAt: in20Days,
    });
    expect(status.state).toBe('expiring');
    expect(status.daysLeft).toBeLessThanOrEqual(20);
  });

  test('flags expired subscription', () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const status = marketplaceSubscriptionStatus({
      marketplaceTier: 'STANDARD',
      marketplaceExpiresAt: past,
    });
    expect(status.state).toBe('expired');
  });

  test('renew extends expiry by one year from current end', () => {
    const end = new Date('2026-12-01T00:00:00.000Z');
    const next = subscriptionDatesForTierChange(
      { marketplaceStartedAt: new Date('2025-12-01'), marketplaceExpiresAt: end },
      'PREMIUM',
      { renew: true },
    );
    expect(next.marketplaceExpiresAt.getFullYear()).toBe(2027);
  });

  test('new live tier gets one year from now', () => {
    const next = subscriptionDatesForTierChange({}, 'STANDARD');
    expect(next.marketplaceStartedAt).toBeInstanceOf(Date);
    expect(next.marketplaceExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(addOneYear(next.marketplaceStartedAt).getTime()).toBe(next.marketplaceExpiresAt.getTime());
  });
});
