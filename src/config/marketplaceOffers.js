const { MARKETPLACE_TIER } = require('../utils/marketplaceAddon');

const MARKETPLACE_OFFER_OPTIONS = [
  {
    value: MARKETPLACE_TIER.NONE,
    label: 'Sans vitrine',
    shortLabel: 'Aucune',
    amount: 0,
    hint: 'Gestion Pro uniquement — pas de page publique ni listing /ecoles.',
  },
  {
    value: MARKETPLACE_TIER.STANDARD,
    label: 'Standard',
    shortLabel: 'Standard',
    amount: 50000,
    hint: 'Page /e/:slug + fiche sur /ecoles.',
  },
  {
    value: MARKETPLACE_TIER.PREMIUM,
    label: 'Premium',
    shortLabel: 'Premium',
    amount: 150000,
    hint: 'Mise en avant sur /ecoles + badge Premium.',
  },
  {
    value: MARKETPLACE_TIER.VIP,
    label: 'VIP',
    shortLabel: 'VIP',
    amount: 300000,
    hint: 'En tête de /ecoles + badge VIP.',
  },
];

const MARKETPLACE_OFFER_BY_TIER = Object.fromEntries(
  MARKETPLACE_OFFER_OPTIONS.map((opt) => [opt.value, opt]),
);

function marketplaceOfferAmount(tier) {
  const key = String(tier || MARKETPLACE_TIER.NONE).toUpperCase();
  return MARKETPLACE_OFFER_BY_TIER[key]?.amount ?? 0;
}

function marketplaceOfferForTier(tier) {
  const key = String(tier || MARKETPLACE_TIER.NONE).toUpperCase();
  return MARKETPLACE_OFFER_BY_TIER[key] || MARKETPLACE_OFFER_BY_TIER[MARKETPLACE_TIER.NONE];
}

function parseQuoteMarketplaceTier(raw) {
  const value = String(raw || '').trim().toUpperCase();
  if (value === 'NONE' || value === 'NON' || value === '') return MARKETPLACE_TIER.NONE;
  if (MARKETPLACE_OFFER_BY_TIER[value]) return value;
  return MARKETPLACE_TIER.NONE;
}

module.exports = {
  MARKETPLACE_OFFER_OPTIONS,
  MARKETPLACE_OFFER_BY_TIER,
  marketplaceOfferAmount,
  marketplaceOfferForTier,
  parseQuoteMarketplaceTier,
};
