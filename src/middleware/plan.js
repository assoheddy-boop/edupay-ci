const { MODULES } = require('../config/modules');
const { resolveSchoolId, resolveParentSchoolIds } = require('./modules');
const { getSchoolPlan, planIncludesFeature } = require('../utils/plans');
const { bypassPlanAndModules } = require('../utils/adminAssist');

function denyModule(req, res, moduleKey, school) {
  const isUpgrade = moduleKey === 'redoublementAnalysis';
  return res.status(403).render('school/module-disabled', {
    user: req.user,
    moduleKey,
    moduleLabel: MODULES[moduleKey]?.label || moduleKey,
    school: school || req.user?.school || req.user?.teacher?.school || null,
    upgrade: isUpgrade,
    upgradeMessage: isUpgrade ? 'Inclus dans l\'offre Pro, activé par EduConnect.' : undefined,
  });
}

/**
 * Bloque l'accès si le plan d'abonnement de l'école n'inclut pas le module.
 */
function requirePlan(moduleKey) {
  return async (req, res, next) => {
    try {
      if (bypassPlanAndModules(req.user)) return next();

      const schoolId = await resolveSchoolId(req.user, req);

      if (!schoolId && req.user?.role === 'PARENT') {
        const schoolIds = await resolveParentSchoolIds(req.user);
        for (const sid of schoolIds) {
          const plan = await getSchoolPlan(sid);
          if (planIncludesFeature(plan, moduleKey)) return next();
        }
        return denyModule(req, res, moduleKey, null);
      }

      if (!schoolId) {
        return res.status(403).render('error', { message: 'Module non disponible', user: req.user });
      }

      const plan = await getSchoolPlan(schoolId);
      if (!planIncludesFeature(plan, moduleKey)) {
        return denyModule(req, res, moduleKey, req.user.school || req.user.teacher?.school);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requirePlan, planIncludesFeature };
