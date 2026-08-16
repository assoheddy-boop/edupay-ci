function requireCronSecret(req, res, next) {
  const expected = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === 'production' && !expected) {
    return res.status(403).json({ error: 'Non autorisé' });
  }
  if (!expected) return next();
  const got = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    || req.headers['x-cron-secret'];
  if (got !== expected) return res.status(401).json({ error: 'Non autorisé' });
  return next();
}

module.exports = { requireCronSecret };
