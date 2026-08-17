const crypto = require('crypto');
const { getCookieOptions } = require('./cookies');

const CSRF_COOKIE = 'devis_csrf';
const CSRF_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function createCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isHexToken(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function setCsrfCookie(res, token) {
  res.cookie(CSRF_COOKIE, token, {
    ...getCookieOptions(),
    maxAge: CSRF_MAX_AGE_MS,
  });
}

function readCsrfCookie(req) {
  return req.cookies?.[CSRF_COOKIE] || '';
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

function requireCsrf(req, res, next) {
  const cookieToken = readCsrfCookie(req);
  const bodyToken = req.body?._csrf || req.body?.csrf || '';
  if (!csrfTokensMatch(cookieToken, bodyToken)) {
    return res.status(403).render('error', {
      message: 'Session expirée. Rechargez le formulaire et réessayez.',
      user: null,
    });
  }
  return next();
}

module.exports = {
  CSRF_COOKIE,
  createCsrfToken,
  ensureCsrfToken,
  csrfTokensMatch,
  requireCsrf,
};
