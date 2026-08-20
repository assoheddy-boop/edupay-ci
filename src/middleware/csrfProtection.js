const { ensureCsrfToken, requireCsrf } = require('../utils/csrf');

function usesBearerAuth(req) {
  return Boolean(req.headers.authorization?.match(/^Bearer\s+/i));
}

function isWebhookOrCron(req) {
  const path = req.originalUrl || req.path || '';
  return path.startsWith('/api/internal/cron')
    || path.includes('/webhook');
}

function shouldSkipCsrf(req) {
  if (isWebhookOrCron(req)) return true;
  if (req.originalUrl?.startsWith('/api/v1/') && usesBearerAuth(req)) return true;
  if (usesBearerAuth(req) && !req.cookies?.token) return true;
  return false;
}

function attachCsrfToken(req, res, next) {
  res.locals.csrfToken = ensureCsrfToken(req, res);
  next();
}

function csrfProtection(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (shouldSkipCsrf(req)) return next();
  return requireCsrf(req, res, next);
}

module.exports = {
  attachCsrfToken,
  csrfProtection,
  shouldSkipCsrf,
};
