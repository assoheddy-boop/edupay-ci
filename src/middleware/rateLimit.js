const rateLimit = require('express-rate-limit');

const vercelSafe = {
  validate: false,
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Trop de tentatives. Réessayez dans 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  ...vercelSafe,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Trop d\'uploads. Patientez une minute.',
  ...vercelSafe,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  ...vercelSafe,
});

const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { ok: false, error: 'rate' },
  ...vercelSafe,
});

const childLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Trop de tentatives de liaison. Réessayez dans 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  ...vercelSafe,
});

const devisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'Trop de demandes de devis. Réessayez dans 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  ...vercelSafe,
});

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Trop de messages. Réessayez dans 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  ...vercelSafe,
});

const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: 'Trop d’avis envoyés. Réessayez dans 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  ...vercelSafe,
});

const timetableAiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Trop de générations IA. Réessayez dans 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  ...vercelSafe,
});

const timetableChatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { ok: false, error: 'rate_limit', message: 'Trop de messages. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  ...vercelSafe,
});

module.exports = {
  authLimiter,
  uploadLimiter,
  apiLimiter,
  syncLimiter,
  childLinkLimiter,
  devisLimiter,
  contactLimiter,
  reviewLimiter,
  timetableAiLimiter,
  timetableChatLimiter,
};
