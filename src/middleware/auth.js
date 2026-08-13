const { verifyToken } = require('../utils/jwt');
const { getCookieOptions } = require('../utils/cookies');
const prisma = require('../config/database');

const ROLE_ALIASES = {
  school: 'SCHOOL_ADMIN',
  parent: 'PARENT',
  teacher: 'TEACHER',
  admin: 'SUPER_ADMIN',
  group: 'ORGANIZATION_ADMIN',
};

function isApiRequest(req) {
  return req.originalUrl.startsWith('/api/');
}

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie('token', getCookieOptions());
}

async function requireAuth(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    if (isApiRequest(req)) return res.status(401).json({ error: 'Non authentifié' });
    if (req.accepts('html')) return res.redirect('/auth/login');
    return res.status(401).json({ error: 'Non authentifié' });
  }

  try {
    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        school: true,
        teacher: { include: { school: true } },
        parentProfile: true,
        organizationAdmin: { include: { organization: true } },
      },
    });

    if (!user) {
      clearAuthCookie(res);
      if (isApiRequest(req)) return res.status(401).json({ error: 'Non authentifié' });
      return res.redirect('/auth/login');
    }

    req.user = user;
    res.locals.user = user;
    next();
  } catch (err) {
    if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
      clearAuthCookie(res);
      if (isApiRequest(req)) return res.status(401).json({ error: 'Session expirée' });
      if (req.accepts('html')) return res.redirect('/auth/login');
      return res.status(401).json({ error: 'Session expirée' });
    }
    console.error('[auth] requireAuth failed:', err?.message || err);
    if (isApiRequest(req)) return res.status(500).json({ error: 'Erreur d\'authentification' });
    if (req.accepts('html')) {
      return res.status(500).render('error', {
        message: 'Erreur serveur lors de l\'authentification. Vérifiez que la base est à jour (npm run db:push).',
        user: null,
      });
    }
    return res.status(500).json({ error: 'Erreur d\'authentification' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      if (isApiRequest(req)) return res.status(403).json({ error: 'Accès refusé' });
      if (req.accepts('html')) return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
      return res.status(403).json({ error: 'Accès refusé' });
    }
    next();
  };
}

function checkRole(role) {
  const expected = ROLE_ALIASES[role] || role;
  return (req, res, next) => {
    if (!req.user || req.user.role !== expected) {
      return res.status(403).send('Forbidden');
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  checkRole,
  setAuthCookie,
  clearAuthCookie,
  ROLE_ALIASES,
};
