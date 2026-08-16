const prisma = require('../config/database');
const { signToken, verifyToken } = require('./jwt');
const { logAudit } = require('./audit');
const {
  ASSIST_COOKIE,
  getCookieOptions,
  clearAssistCookie,
} = require('./cookies');

const ASSIST_TTL = '7d';

function isSuperAdmin(user) {
  return user?.role === 'SUPER_ADMIN';
}

function bypassPlanAndModules(user) {
  return isSuperAdmin(user);
}

function hasEffectiveRole(user, expected) {
  if (!user || !expected) return false;
  if (user.role === expected) return true;
  if (!isSuperAdmin(user) || !user.adminAssist) return false;
  if (expected === 'SCHOOL_ADMIN' && user.adminAssist.type === 'school') return true;
  if (expected === 'ORGANIZATION_ADMIN' && user.adminAssist.type === 'group') return true;
  return false;
}

function setAssistCookie(res, payload) {
  const token = signToken(payload, { expiresIn: ASSIST_TTL });
  res.cookie(ASSIST_COOKIE, token, getCookieOptions());
}

function readAssistPayload(req) {
  const token = req.cookies?.[ASSIST_COOKIE];
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

function applySchoolAssist(user, school) {
  user.school = school;
  user.adminAssist = {
    type: 'school',
    schoolId: school.id,
    label: school.name,
  };
  return user;
}

function applyGroupAssist(user, organization) {
  user.organizationAdmin = {
    organizationId: organization.id,
    organization,
  };
  user.adminAssist = {
    type: 'group',
    organizationId: organization.id,
    label: organization.name,
  };
  return user;
}

async function attachAdminAssist(req, res, user) {
  if (!user || !isSuperAdmin(user)) return user;

  const payload = readAssistPayload(req);
  if (!payload) {
    if (req.cookies?.[ASSIST_COOKIE]) clearAssistCookie(res);
    return user;
  }

  if (payload.uid !== user.id) {
    clearAssistCookie(res);
    return user;
  }

  if (payload.t === 'school' && typeof payload.sid === 'string' && payload.sid) {
    const school = await prisma.school.findUnique({
      where: { id: payload.sid },
      include: { organization: true },
    });
    if (!school) {
      clearAssistCookie(res);
      return user;
    }
    return applySchoolAssist(user, school);
  }

  if (payload.t === 'group' && typeof payload.oid === 'string' && payload.oid) {
    const organization = await prisma.organization.findUnique({
      where: { id: payload.oid },
    });
    if (!organization) {
      clearAssistCookie(res);
      return user;
    }
    return applyGroupAssist(user, organization);
  }

  clearAssistCookie(res);
  return user;
}

async function beginSchoolAssist(req, res) {
  if (!isSuperAdmin(req.user)) return { ok: false, status: 403 };
  const schoolId = req.params?.id;
  if (!schoolId || typeof schoolId !== 'string') return { ok: false, status: 404 };

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return { ok: false, status: 404 };

  setAssistCookie(res, { uid: req.user.id, t: 'school', sid: school.id });
  await logAudit({
    action: 'admin_assist_start',
    entity: 'School',
    entityId: school.id,
    user: req.user,
    schoolId: school.id,
    details: { type: 'school', name: school.name },
    ip: req.ip,
    sensitive: true,
  });
  return { ok: true, redirect: '/school/dashboard', school };
}

async function beginGroupAssist(req, res) {
  if (!isSuperAdmin(req.user)) return { ok: false, status: 403 };
  const organizationId = req.params?.id;
  if (!organizationId || typeof organizationId !== 'string') return { ok: false, status: 404 };

  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) return { ok: false, status: 404 };

  setAssistCookie(res, { uid: req.user.id, t: 'group', oid: organization.id });
  await logAudit({
    action: 'admin_assist_start',
    entity: 'Organization',
    entityId: organization.id,
    user: req.user,
    details: { type: 'group', name: organization.name },
    ip: req.ip,
    sensitive: true,
  });
  return { ok: true, redirect: '/group/dashboard', organization };
}

async function stopAssist(req, res) {
  const assist = req.user?.adminAssist || null;
  clearAssistCookie(res);
  if (isSuperAdmin(req.user) && assist) {
    await logAudit({
      action: 'admin_assist_stop',
      entity: assist.type === 'group' ? 'Organization' : 'School',
      entityId: assist.schoolId || assist.organizationId || null,
      user: req.user,
      schoolId: assist.schoolId || null,
      details: { type: assist.type, name: assist.label },
      ip: req.ip,
      sensitive: true,
    });
  }
  return { ok: true, redirect: '/admin/dashboard' };
}

module.exports = {
  ASSIST_TTL,
  isSuperAdmin,
  bypassPlanAndModules,
  hasEffectiveRole,
  setAssistCookie,
  clearAssistCookie,
  readAssistPayload,
  applySchoolAssist,
  applyGroupAssist,
  attachAdminAssist,
  beginSchoolAssist,
  beginGroupAssist,
  stopAssist,
};
