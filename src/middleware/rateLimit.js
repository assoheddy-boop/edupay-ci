const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Trop de tentatives. Réessayez dans 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Trop d\'uploads. Patientez une minute.',
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
});

module.exports = { authLimiter, uploadLimiter, apiLimiter };
