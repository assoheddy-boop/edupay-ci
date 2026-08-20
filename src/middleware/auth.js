const { applyI18n } = require('./i18n');
const { applyCurrency } = require('./currency');
const { verifyToken, signToken } = require('../utils/jwt');
const {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  getCookieOptions,
  getRefreshCookieOptions,
  clearAssistCookie,
} = require('../utils/cookies');
const { attachAdminAssist, hasEffectiveRole } = require('../utils/adminAssist');
const { attachStaffContext, resolveStaffSchoolId } = require('../utils/staffPermissions');
const {
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeUserRefreshTokens,
} = require('../utils/refreshToken');
const prisma = require('../config/database');

const ROLE_ALIASES = {
  school: 'SCHOOL_ADMIN',
  parent: 'PARENT',
  teacher: 'TEACHER',
  student: 'STUDENT',
  admin: 'SUPER_ADMIN',
  group: 'ORGANIZATION_ADMIN',
};

function isApiRequest(req) {
  return req.originalUrl.startsWith('/api/');
}

function setAuthCookie(res, token) {
  res.cookie(ACCESS_COOKIE, token, getCookieOptions());
}

function setRefreshCookie(res, raw) {
  res.cookie(REFRESH_COOKIE, raw, getRefreshCookieOptions());
}

function clearAuthCookie(res) {
  res.clearCookie(ACCESS_COOKIE, getCookieOptions());
  res.clearCookie(REFRESH_COOKIE, getRefreshCookieOptions());
  clearAssistCookie(res);
}

async function issueAuthSession(res, user) {
  const token = signToken({ userId: user.id, role: user.role });
  setAuthCookie(res, token);
  try {
    const refresh = await createRefreshToken(user.id);
    setRefreshCookie(res, refresh.raw);
  } catch (err) {
    console.error('[auth] refresh token not issued:', err?.message || err);
  }
  return token;
}

async function tryRefreshSession(req, res) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) return null;
  try {
    const rotated = await rotateRefreshToken(raw);
    if (!rotated) return null;
    const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
    if (!user) return null;
    const accessToken = signToken({ userId: user.id, role: user.role });
    setAuthCookie(res, accessToken);
    setRefreshCookie(res, rotated.raw);
    return { user, accessToken };
  } catch (err) {
    console.error('[auth] refresh failed:', err?.message || err);
    return null;
  }
}

async function destroyAuthSession(req, res) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  try {
    if (raw) await revokeRefreshToken(raw);
    const token = req.cookies?.[ACCESS_COOKIE];
    if (token) {
      try {
        const decoded = verifyToken(token, { ignoreExpiration: true });
        if (decoded?.userId) await revokeUserRefreshTokens(decoded.userId);
      } catch { /* ignore invalid access token */ }
    }
  } catch (err) {
    console.error('[auth] revoke refresh failed:', err?.message || err);
  }
  clearAuthCookie(res);
}

async function loadUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      school: true,
      staffAssignments: { include: { school: true } },
      teacher: { include: { school: true } },
      parentProfile: true,
      organizationAdmin: { include: { organization: true } },
      student: { include: { class: { include: { school: true } } } },
    },
  });

  if (user && !user.school && user.staffAssignments?.length === 1) {
    user.school = user.staffAssignments[0].school;
  }

  return user;
}

function unauthenticated(req, res) {
  if (isApiRequest(req)) return res.status(401).json({ error: 'Non authentifié' });
  if (req.accepts('html')) return res.redirect('/auth/login');
  return res.status(401).json({ error: 'Non authentifié' });
}

async function requireAuth(req, res, next) {
  let token = req.cookies?.[ACCESS_COOKIE] || req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (!token && req.cookies?.[REFRESH_COOKIE]) {
    const rotated = await tryRefreshSession(req, res);
    if (rotated) token = rotated.accessToken;
  }

  if (!token) return unauthenticated(req, res);

  try {
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      if (err?.name === 'TokenExpiredError' && req.cookies?.[REFRESH_COOKIE]) {
        const rotated = await tryRefreshSession(req, res);
        if (!rotated) {
          clearAuthCookie(res);
          if (isApiRequest(req)) return res.status(401).json({ error: 'Session expirée' });
          if (req.accepts('html')) return res.redirect('/auth/login');
          return res.status(401).json({ error: 'Session expirée' });
        }
        decoded = verifyToken(rotated.accessToken);
      } else {
        throw err;
      }
    }

    const user = await loadUser(decoded.userId);

    if (!user || user.isActive === false) {
      clearAuthCookie(res);
      return unauthenticated(req, res);
    }

    await attachAdminAssist(req, res, user);
    req.user = user;
    res.locals.user = user;
    res.locals.adminAssist = user.adminAssist || null;

    const staffCtx = attachStaffContext(user, resolveStaffSchoolId(user));
    res.locals.staffRole = staffCtx.staffRole;
    res.locals.staffRoleLabel = staffCtx.staffRoleLabel;
    res.locals.staffPermissions = staffCtx.staffPermissions;
    res.locals.staffCan = staffCtx.staffCan;

    applyI18n(req, res);
    applyCurrency(req, res);
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
    if (!req.user || !roles.some((role) => hasEffectiveRole(req.user, role))) {
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
    if (!req.user || !hasEffectiveRole(req.user, expected)) {
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
  setRefreshCookie,
  clearAuthCookie,
  issueAuthSession,
  tryRefreshSession,
  destroyAuthSession,
  ROLE_ALIASES,
  hasEffectiveRole,
};
