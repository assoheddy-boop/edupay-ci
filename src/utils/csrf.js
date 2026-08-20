const crypto = require('crypto');
const { getCookieOptions } = require('./cookies');

const CSRF_COOKIE = 'edu_csrf';
const LEGACY_CSRF_COOKIE = 'devis_csrf';
const CSRF_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function createCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isHexToken(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function setCsrfCookie(res, token) {
  const opts = { ...getCookieOptions(), maxAge: CSRF_MAX_AGE_MS };
  res.cookie(CSRF_COOKIE, token, opts);
  res.cookie(LEGACY_CSRF_COOKIE, token, opts);
}

function readCsrfCookie(req) {
  const primary = req.cookies?.[CSRF_COOKIE] || '';
  if (isHexToken(primary)) return primary;
  const legacy = req.cookies?.[LEGACY_CSRF_COOKIE] || '';
  if (isHexToken(legacy)) return legacy;
  return '';
}

function ensureCsrfToken(req, res) {
  const existing = readCsrfCookie(req);
  if (isHexToken(existing)) return existing;
  const token = createCsrfToken();
  setCsrfCookie(res, token);
  return token;
}

function csrfTokensMatch(cookieToken, bodyToken) {
  if (!isHexToken(cookieToken) || !isHexToken(bodyToken)) return false;
  const a = Buffer.from(cookieToken, 'utf8');
  const b = Buffer.from(bodyToken, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function readSubmittedCsrfToken(req) {
  const header = req.headers['x-csrf-token'] || req.headers['x-csrftoken'] || '';
  if (typeof header === 'string' && header) return header;
  return req.body?._csrf || req.body?.csrf || '';
}

function csrfErrorResponse(req, res) {
  const message = 'Session expirée. Rechargez le formulaire et réessayez.';
  if (req.originalUrl?.startsWith('/api/') || req.accepts('json') === 'json') {
    return res.status(403).json({ error: message, code: 'csrf_invalid' });
  }
  return res.status(403).render('error', { message, user: req.user || null });
}

function requireCsrf(req, res, next) {
  const cookieToken = readCsrfCookie(req);
  const bodyToken = readSubmittedCsrfToken(req);
  if (!csrfTokensMatch(cookieToken, bodyToken)) {
    return csrfErrorResponse(req, res);
  }
  return next();
}

module.exports = {
  CSRF_COOKIE,
  LEGACY_CSRF_COOKIE,
  createCsrfToken,
  ensureCsrfToken,
  csrfTokensMatch,
  readSubmittedCsrfToken,
  requireCsrf,
};
