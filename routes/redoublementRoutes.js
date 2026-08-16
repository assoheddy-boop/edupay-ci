const express = require('express');
const { requireAuth } = require('../src/middleware/auth');
const { resolveSchoolId } = require('../src/middleware/modules');
const { getSchoolPlan, planIncludesFeature } = require('../src/utils/plans');
const { MODULES } = require('../src/config/modules');
const { getRedoublementCausesByPlan, hidePeerSchools } = require('../services/RedoublementService');

const MODULE_KEY = 'redoublementAnalysis';
const UPGRADE_MESSAGE = 'Disponible en plan supérieur';

const router = express.Router();

function wantsJson(req) {
  return req.xhr
    || req.originalUrl.startsWith('/api/')
    || (req.headers.accept && req.headers.accept.includes('application/json')
      && !req.headers.accept.includes('text/html'));
}

function denyUpgrade(req, res) {
  if (wantsJson(req)) {
    return res.status(403).json({ error: 'upgrade', message: UPGRADE_MESSAGE });
  }
  return res.status(403).render('school/module-disabled', {
    user: req.user,
    moduleKey: MODULE_KEY,
    moduleLabel: MODULES[MODULE_KEY]?.label || MODULE_KEY,
    school: req.user?.school || req.user?.teacher?.school || null,
    upgrade: true,
    upgradeMessage: UPGRADE_MESSAGE,
  });
}

async function requireRedoublementAnalysis(req, res, next) {
  if (req.user?.role === 'SUPER_ADMIN') return next();

  const schoolId = await resolveSchoolId(req.user, req);
  if (!schoolId) {
    if (wantsJson(req)) {
      return res.status(403).json({ error: 'upgrade', message: UPGRADE_MESSAGE });
    }
    return denyUpgrade(req, res);
  }

  const plan = await getSchoolPlan(schoolId);
  if (!planIncludesFeature(plan, MODULE_KEY)) {
    return denyUpgrade(req, res);
  }

  req.redoublementSchoolId = schoolId;
  req.redoublementPlan = plan;
  return next();
}

router.get('/plans/:schoolYear', requireAuth, requireRedoublementAnalysis, async (req, res, next) => {
  try {
    const { schoolYear } = req.params;
    const result = await getRedoublementCausesByPlan(schoolYear);

    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error || 'stats' });
    }

    if (req.user?.role !== 'SUPER_ADMIN') {
      if (req.redoublementPlan) {
        const planName = req.redoublementPlan.name;
        result.plans = result.plans.filter((p) => p.planName === planName);
      }
      result.plans = hidePeerSchools(result.plans, req.redoublementSchoolId);
    }

    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
