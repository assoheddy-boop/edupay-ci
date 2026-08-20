const { isLiveTier, parseMarketplaceTier } = require('./marketplaceAddon');

const RENEWAL_WARNING_DAYS = 30;

function addOneYear(fromDate = new Date()) {
  const base = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const next = new Date(base);
  next.setFullYear(next.getFullYear() + 1);
  return next;
}

function daysUntil(date) {
  if (!date) return null;
  const target = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(target.getTime())) return null;
  const ms = target.getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function marketplaceSubscriptionStatus(school) {
  const tier = parseMarketplaceTier(school?.marketplaceTier);
  if (!isLiveTier(tier)) {
    return { tier, state: 'none', daysLeft: null, label: 'Sans abonnement' };
  }
  const expiresAt = school?.marketplaceExpiresAt ? new Date(school.marketplaceExpiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
    return { tier, state: 'active', daysLeft: null, label: 'Actif (date non renseignée)' };
  }
  const daysLeft = daysUntil(expiresAt);
  if (daysLeft < 0) {
    return { tier, state: 'expired', daysLeft, label: 'Expiré', expiresAt };
  }
  if (daysLeft <= RENEWAL_WARNING_DAYS) {
    return { tier, state: 'expiring', daysLeft, label: `Expire dans ${daysLeft} j`, expiresAt };
  }
  return { tier, state: 'active', daysLeft, label: 'Actif', expiresAt };
}

function subscriptionDatesForTierChange(school, nextTier, { renew = false } = {}) {
  const tier = parseMarketplaceTier(nextTier);
  if (!isLiveTier(tier)) {
    return {};
  }
  const now = new Date();
  const currentStart = school?.marketplaceStartedAt ? new Date(school.marketplaceStartedAt) : null;
  const currentExpiry = school?.marketplaceExpiresAt ? new Date(school.marketplaceExpiresAt) : null;
  const validStart = currentStart && !Number.isNaN(currentStart.getTime());
  const hasValidExpiry = currentExpiry && !Number.isNaN(currentExpiry.getTime()) && currentExpiry > now;

  if (renew) {
    const base = hasValidExpiry ? currentExpiry : now;
    return {
      marketplaceStartedAt: validStart ? currentStart : now,
      marketplaceExpiresAt: addOneYear(base),
    };
  }

  if (hasValidExpiry && validStart) {
    return {
      marketplaceStartedAt: currentStart,
      marketplaceExpiresAt: currentExpiry,
    };
  }

  return {
    marketplaceStartedAt: now,
    marketplaceExpiresAt: addOneYear(now),
  };
}

module.exports = {
  RENEWAL_WARNING_DAYS,
  addOneYear,
  daysUntil,
  marketplaceSubscriptionStatus,
  subscriptionDatesForTierChange,
};
