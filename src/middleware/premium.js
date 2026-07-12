const PREMIUM_PLANS = ['premium', 'pro', 'standard'];

function hasPremium(subscription) {
  return PREMIUM_PLANS.includes(subscription);
}

function requirePremium(featureName) {
  return (req, res, next) => {
    const sub = req.user?.school?.subscription || 'free';
    if (req.user?.role === 'SCHOOL_ADMIN' && !hasPremium(sub)) {
      if (req.accepts('html')) {
        return res.status(403).render('school/upgrade', {
          user: req.user,
          feature: featureName,
          school: req.user.school,
        });
      }
      return res.status(403).json({ error: 'Abonnement premium requis', feature: featureName });
    }
    next();
  };
}

module.exports = { hasPremium, requirePremium, PREMIUM_PLANS };
