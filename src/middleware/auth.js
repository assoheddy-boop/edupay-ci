const { verifyToken } = require('../utils/jwt');
const prisma = require('../config/database');

function isApiRequest(req) {
  return req.originalUrl.startsWith('/api/');
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
      res.clearCookie('token');
      if (isApiRequest(req)) return res.status(401).json({ error: 'Non authentifié' });
      return res.redirect('/auth/login');
    }

    req.user = user;
    next();
  } catch {
    res.clearCookie('token');
    if (isApiRequest(req)) return res.status(401).json({ error: 'Session expirée' });
    if (req.accepts('html')) return res.redirect('/auth/login');
    return res.status(401).json({ error: 'Session expirée' });
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

module.exports = { requireAuth, requireRole };
