const prisma = require('../config/database');
const { setModule } = require('./modules');

const MARKETPLACE_MODULE = 'marketplace';

const MARKETPLACE_TIER = {
  NONE: 'NONE',
  STANDARD: 'STANDARD',
  PREMIUM: 'PREMIUM',
  VIP: 'VIP',
};

const LIVE_TIERS = [
  MARKETPLACE_TIER.STANDARD,
  MARKETPLACE_TIER.PREMIUM,
  MARKETPLACE_TIER.VIP,
];

const MARKETPLACE_TIER_OPTIONS = [
  { value: MARKETPLACE_TIER.NONE, label: 'Aucun — pas de vitrine' },
  { value: MARKETPLACE_TIER.STANDARD, label: 'Standard — page /e/:slug' },
  { value: MARKETPLACE_TIER.PREMIUM, label: 'Premium — mise en avant' },
  { value: MARKETPLACE_TIER.VIP, label: 'VIP — en tête de /ecoles' },
];

function parseMarketplaceTier(raw) {
  const upper = String(raw || '').trim().toUpperCase();
  if (MARKETPLACE_TIER[upper]) return upper;
  return MARKETPLACE_TIER.NONE;
}

function isLiveTier(tier) {
  return LIVE_TIERS.includes(parseMarketplaceTier(tier));
}

function isFeaturedTier(tier) {
  const value = parseMarketplaceTier(tier);
  return value === MARKETPLACE_TIER.PREMIUM || value === MARKETPLACE_TIER.VIP;
}

function featuredFromTier(tier) {
  return isFeaturedTier(tier);
}

function marketplaceSortRank(school) {
  const tier = parseMarketplaceTier(school?.marketplaceTier);
  if (tier === MARKETPLACE_TIER.VIP) return 3;
  if (tier === MARKETPLACE_TIER.PREMIUM || school?.publicFeatured) return 2;
  if (tier === MARKETPLACE_TIER.STANDARD) return 1;
  return 0;
}

function marketplaceBadge(school) {
  const tier = parseMarketplaceTier(school?.marketplaceTier);
  if (tier === MARKETPLACE_TIER.VIP) {
    return { key: MARKETPLACE_TIER.VIP, label: 'VIP', className: 'is-vip' };
  }
  if (tier === MARKETPLACE_TIER.PREMIUM) {
    return { key: MARKETPLACE_TIER.PREMIUM, label: 'Premium', className: 'is-premium' };
  }
  if (tier === MARKETPLACE_TIER.STANDARD || school?.publicFeatured) {
    return { key: MARKETPLACE_TIER.STANDARD, label: 'Partenaire', className: 'is-partner' };
  }
  return null;
}

function publishedWhere(extra = {}) {
  return {
    publicPortalEnabled: true,
    slug: { not: null },
    marketplaceTier: { in: LIVE_TIERS },
    modules: {
      some: { moduleKey: MARKETPLACE_MODULE, enabled: true },
    },
    ...extra,
  };
}

function publishedWhereLegacy() {
  return {
    publicPortalEnabled: true,
    slug: { not: null },
  };
}

function tierUpdateData(tier) {
  const marketplaceTier = parseMarketplaceTier(tier);
  return {
    marketplaceTier,
    publicFeatured: featuredFromTier(marketplaceTier),
  };
}

async function applyMarketplaceOffer(schoolId, { tier, publish, enableModule } = {}) {
  if (!schoolId) return { ok: false };
  const marketplaceTier = parseMarketplaceTier(tier);
  const live = isLiveTier(marketplaceTier);
  const moduleOn = enableModule == null ? live : Boolean(enableModule);

  await setModule(schoolId, MARKETPLACE_MODULE, { enabled: moduleOn, locked: true });

  const data = tierUpdateData(marketplaceTier);
  if (publish === true) data.publicPortalEnabled = true;
  if (publish === false) data.publicPortalEnabled = false;

  try {
    await prisma.school.update({ where: { id: schoolId }, data });
  } catch (err) {
    if (data.marketplaceTier != null) {
      const fallback = { ...data };
      delete fallback.marketplaceTier;
      if (Object.keys(fallback).length) {
        await prisma.school.update({ where: { id: schoolId }, data: fallback });
      }
    } else {
      throw err;
    }
  }
  return { ok: true, marketplaceTier, publicFeatured: data.publicFeatured, moduleOn };
}

async function syncMarketplaceAfterModuleChange(schoolId, enabled) {
  if (!schoolId || !enabled) return;
  try {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { marketplaceTier: true },
    });
    if (!school) return;
    if (parseMarketplaceTier(school.marketplaceTier) === MARKETPLACE_TIER.NONE) {
      await prisma.school.update({
        where: { id: schoolId },
        data: { marketplaceTier: MARKETPLACE_TIER.STANDARD, publicFeatured: false },
      });
    }
  } catch {
    // Colonne absente avant prisma db push.
  }
}

module.exports = {
  MARKETPLACE_MODULE,
  MARKETPLACE_TIER,
  LIVE_TIERS,
  MARKETPLACE_TIER_OPTIONS,
  parseMarketplaceTier,
  isLiveTier,
  isFeaturedTier,
  featuredFromTier,
  marketplaceSortRank,
  marketplaceBadge,
  publishedWhere,
  publishedWhereLegacy,
  tierUpdateData,
  applyMarketplaceOffer,
  syncMarketplaceAfterModuleChange,
};
