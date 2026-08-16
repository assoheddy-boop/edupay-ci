const { MODULES, MODULE_KEYS } = require('../config/modules');

const PREMIUM_PLANS = ['premium', 'pro', 'groupe', 'standard'];

const FEATURE_TO_MODULE = {
  chat: 'chat',
  'bulletins pdf': 'bulletins',
  bulletins: 'bulletins',
  statistiques: 'stats',
  'statistiques & exports': 'stats',
  'export excel': 'stats',
  stats: 'stats',
};

function hasPremium(subscription) {
  if (!subscription) return false;
  return PREMIUM_PLANS.includes(String(subscription).toLowerCase());
}

function resolvePremiumModule(featureName) {
  const raw = String(featureName || '').trim();
  if (!raw) return null;
  if (MODULE_KEYS.includes(raw)) return raw;

  const key = raw.toLowerCase();
  if (FEATURE_TO_MODULE[key]) return FEATURE_TO_MODULE[key];

  const exactLabel = MODULE_KEYS.find((k) => MODULES[k].label.toLowerCase() === key);
  if (exactLabel) return exactLabel;

  const partial = MODULE_KEYS.find((k) => {
    const label = MODULES[k].label.toLowerCase();
    return label.includes(key) || key.includes(k.replace(/_/g, ' '));
  });
  if (partial) return partial;

  return raw.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Alias of plan gating — same rules as requirePlan / requireModule.
 * Feature display names used in routes ('Chat', 'Bulletins PDF', …) map to module keys.
 */
function requirePremium(featureName) {
  const moduleKey = resolvePremiumModule(featureName);
  if (!moduleKey) {
    return (_req, _res, next) => next();
  }
  const { requirePlan } = require('./plan');
  return requirePlan(moduleKey);
}

module.exports = {
  hasPremium,
  requirePremium,
  resolvePremiumModule,
  PREMIUM_PLANS,
  FEATURE_TO_MODULE,
};
