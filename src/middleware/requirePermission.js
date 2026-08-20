const { resolveSchoolId } = require('./modules');
const { hasPermission } = require('../utils/staffPermissions');

function isApiRequest(req) {
  return req.originalUrl.startsWith('/api/');
}

function deny(req, res) {
  if (isApiRequest(req)) return res.status(403).json({ error: 'Accès refusé — permission insuffisante' });
  if (req.accepts('html')) {
    return res.status(403).render('permission-denied', {
      message: 'Cette page ou action n’est pas disponible pour votre rôle.',
      user: req.user,
      staffRoleLabel: res.locals?.staffRoleLabel || null,
    });
  }
  return res.status(403).json({ error: 'Accès refusé' });
}

/**
 * @param {...string} permissions — au moins une permission requise (OU logique).
 */
function requirePermission(...permissions) {
  const required = permissions.flat().filter(Boolean);
  return async (req, res, next) => {
    try {
      if (!req.user) return deny(req, res);

      const schoolId = await resolveSchoolId(req.user, req);
      if (!schoolId) return deny(req, res);

      const allowed = required.some((p) => hasPermission(req.user, p, schoolId));
      if (!allowed) return deny(req, res);

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  requirePermission,
};
