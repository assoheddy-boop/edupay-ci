const jwt = require('jsonwebtoken');

const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '15m';

function getJwtSecrets() {
  if (process.env.JWT_SECRETS) {
    return process.env.JWT_SECRETS.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const current = process.env.JWT_SECRET || 'dev-secret';
  const previous = process.env.JWT_SECRET_PREVIOUS;
  return previous ? [current, previous] : [current];
}

function getJwtSecret() {
  return getJwtSecrets()[0];
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret')) {
  console.warn('[SECURITY] JWT_SECRET manquant ou faible en production — définissez une clé secrète forte.');
}

function signToken(payload, options = {}) {
  const expiresIn = options.expiresIn || ACCESS_TTL;
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

function signAccessToken(payload) {
  return signToken(payload, { expiresIn: ACCESS_TTL });
}

function verifyToken(token, options = {}) {
  const secrets = getJwtSecrets();
  let lastErr;
  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret, options);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

module.exports = {
  signToken,
  signAccessToken,
  verifyToken,
  getJwtSecret,
  getJwtSecrets,
  JWT_SECRET,
  ACCESS_TTL,
};
