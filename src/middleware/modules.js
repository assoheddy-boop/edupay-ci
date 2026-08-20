const prisma = require('../config/database');
const { MODULES, MODULE_KEYS } = require('../config/modules');
const { getModuleMap, isEnabled } = require('../utils/modules');
const { getSchoolPlan, planIncludesFeature } = require('../utils/plans');
const { bypassPlanAndModules } = require('../utils/adminAssist');
const { cycleFlags } = require('../utils/educationCycle');

function enableAllModulesMap(map = {}) {
  const enabled = { ...map };
  MODULE_KEYS.forEach((key) => {
    enabled[key] = { ...(enabled[key] || {}), ...MODULES[key], enabled: true };
  });
  return enabled;
}

async function getParentSchoolIds(parentId) {
  const links = await prisma.parentStudent.findMany({
    where: { parentId },
    include: { student: { include: { class: true } } },
  });
  return [...new Set(links.map((l) => l.student.class.schoolId))];
}

async function resolveSchoolId(user, req) {
  if (user?.school?.id) return user.school.id;
  if (user?.staffAssignments?.length === 1) return user.staffAssignments[0].schoolId;
  if (user?.staffAssignments?.length > 1) {
    const selected = req?.query?.schoolId || req?.cookies?.selectedSchoolId;
    if (selected && user.staffAssignments.some((a) => a.schoolId === selected)) return selected;
    return user.staffAssignments[0].schoolId;
  }
  if (user?.teacher?.schoolId) return user.teacher.schoolId;

  if (user?.studentId && user?.student?.class?.schoolId) {
    return user.student.class.schoolId;
  }
  if (user?.studentId) {
    const row = await prisma.student.findUnique({
      where: { id: user.studentId },
      select: { schoolId: true, class: { select: { schoolId: true } } },
    });
    return row?.schoolId || row?.class?.schoolId || null;
  }

  if (user?.parentProfile?.id) {
    const selected = req?.query?.schoolId || req?.cookies?.selectedSchoolId;
    const schoolIds = await getParentSchoolIds(user.parentProfile.id);

    if (selected && schoolIds.includes(selected)) return selected;
    if (schoolIds.length === 1) return schoolIds[0];
    if (schoolIds.length > 1) return schoolIds[0];
  }
  return null;
}

async function resolveParentSchoolIds(user) {
  if (!user?.parentProfile?.id) return [];
  return getParentSchoolIds(user.parentProfile.id);
}

async function applyPlanMask(schoolId, map) {
  const plan = await getSchoolPlan(schoolId);
  if (!plan) return map;
  const masked = { ...map };
  for (const key of Object.keys(masked)) {
    if (!planIncludesFeature(plan, key)) {
      masked[key] = { ...masked[key], enabled: false };
    }
  }
  return masked;
}

async function attachModules(req, res, next) {
  try {
    const schoolId = await resolveSchoolId(req.user, req);
    if (req.user?.parentProfile?.id) {
      const schoolIds = await resolveParentSchoolIds(req.user);
      res.locals.parentSchoolIds = schoolIds;
      if (schoolIds.length > 1) {
        const maps = await Promise.all(schoolIds.map((id) => getModuleMap(id)));
        const merged = {};
        for (let i = 0; i < schoolIds.length; i += 1) {
          const map = await applyPlanMask(schoolIds[i], maps[i]);
          for (const [key, val] of Object.entries(map)) {
            if (!merged[key]) merged[key] = { ...val };
            else merged[key].enabled = merged[key].enabled || val.enabled;
          }
        }
        res.locals.modules = merged;
      } else if (schoolId) {
        res.locals.modules = await applyPlanMask(schoolId, await getModuleMap(schoolId));
      } else {
        res.locals.modules = {};
      }
    } else if (schoolId) {
      const map = await getModuleMap(schoolId);
      res.locals.modules = bypassPlanAndModules(req.user)
        ? enableAllModulesMap(map)
        : await applyPlanMask(schoolId, map);
    } else {
        res.locals.modules = {};
    }
    res.locals.isModuleEnabled = (key) => isEnabled(res.locals.modules, key);
    res.locals.selectedSchoolId = req?.cookies?.selectedSchoolId || schoolId;

    let cycleValue = req.user?.school?.educationCycle || req.user?.teacher?.school?.educationCycle || null;
    if (!cycleValue && schoolId) {
      try {
        const row = await prisma.school.findUnique({
          where: { id: schoolId },
          select: { educationCycle: true },
        });
        cycleValue = row?.educationCycle || null;
      } catch {
        cycleValue = null;
      }
    }
    res.locals.cycle = cycleFlags(cycleValue);
    next();
  } catch (err) {
    next(err);
  }
}

function requireModule(moduleKey) {
  const { requirePlan } = require('./plan');
  return [
    requirePlan(moduleKey),
    async (req, res, next) => {
      if (bypassPlanAndModules(req.user)) return next();

      const schoolId = await resolveSchoolId(req.user, req);
      if (!schoolId && req.user?.role === 'PARENT') {
        const schoolIds = await resolveParentSchoolIds(req.user);
        for (const sid of schoolIds) {
          const map = await getModuleMap(sid);
          if (isEnabled(map, moduleKey)) return next();
        }
        return res.status(403).render('school/module-disabled', {
          user: req.user,
          moduleKey,
          moduleLabel: moduleKey,
          school: null,
        });
      }

      if (!schoolId) {
        return res.status(403).render('error', { message: 'Module non disponible', user: req.user });
      }

      const map = await getModuleMap(schoolId);
      if (!isEnabled(map, moduleKey)) {
        return res.status(403).render('school/module-disabled', {
          user: req.user,
          moduleKey,
          moduleLabel: map[moduleKey]?.label || moduleKey,
          school: req.user.school || req.user.teacher?.school,
        });
      }
      next();
    },
  ];
}

module.exports = {
  attachModules,
  requireModule,
  resolveSchoolId,
  resolveParentSchoolIds,
  getParentSchoolIds,
  enableAllModulesMap,
};
