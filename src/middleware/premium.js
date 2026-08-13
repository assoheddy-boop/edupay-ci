const PREMIUM_PLANS = ['premium', 'pro', 'standard'];

function hasPremium(subscription) {
  if (!subscription || subscription === 'free') return true;
  return PREMIUM_PLANS.includes(subscription);
}

function requirePremium(_featureName) {
  return (_req, _res, next) => next();
}

module.exports = { hasPremium, requirePremium, PREMIUM_PLANS };
