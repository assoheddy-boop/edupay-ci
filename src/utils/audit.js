const prisma = require('../config/database');

const SENSITIVE_PREFIXES = [
  'login',
  'school_modules',
  'plan_modules',
  'school_plan',
  'scholarship',
  'social_case',
  'accounting',
  'transfer',
  'payroll',
  'admin_assist',
];

function isSensitiveAction(action) {
  if (!action) return false;
  const value = String(action).toLowerCase();
  return SENSITIVE_PREFIXES.some((prefix) => value === prefix || value.startsWith(`${prefix}_`) || value.startsWith(prefix));
}

async function writeAuditTrail({ userId, action, timestamp } = {}) {
  if (!action) return;
  try {
    await prisma.auditTrail.create({
      data: {
        userId: userId || null,
        action: String(action).slice(0, 120),
        timestamp: timestamp || new Date(),
      },
    });
  } catch (err) {
    console.error('[AuditTrail]', err.message);
  }
}

async function logAudit({ action, entity, entityId, user, details, ip, schoolId, sensitive } = {}) {
  try {
    let resolvedSchoolId = schoolId;
    if (!resolvedSchoolId && user?.school?.id) resolvedSchoolId = user.school.id;
    if (!resolvedSchoolId && user?.teacher?.schoolId) resolvedSchoolId = user.teacher.schoolId;

    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        userId: user?.id,
        userEmail: user?.email,
        schoolId: resolvedSchoolId || null,
        details: details ? JSON.stringify(details) : null,
        ip,
      },
    });
  } catch (err) {
    console.error('[AuditLog]', err.message);
  }

  if (sensitive === true || isSensitiveAction(action)) {
    await writeAuditTrail({ userId: user?.id, action });
  }
}

function auditMiddleware(action, entity) {
  return (req, res, next) => {
    const originalRedirect = res.redirect.bind(res);
    const originalJson = res.json.bind(res);

    const done = () => {
      if (res.statusCode < 400) {
        logAudit({
          action,
          entity,
          entityId: req.params.id,
          user: req.user,
          details: { method: req.method, path: req.originalUrl },
          ip: req.ip,
        });
      }
    };

    res.redirect = (...args) => { done(); return originalRedirect(...args); };
    res.json = (...args) => { done(); return originalJson(...args); };
    next();
  };
}

async function listAuditTrail({ userId, action, from, to, take = 500 } = {}) {
  const timestamp = {};
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) timestamp.gte = start;
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      timestamp.lte = end;
    }
  }

  const where = {
    ...(userId ? { userId } : {}),
    ...(action ? { action } : {}),
    ...(Object.keys(timestamp).length ? { timestamp } : {}),
  };

  return prisma.auditTrail.findMany({
    where,
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
    },
    orderBy: { timestamp: 'desc' },
    take,
  });
}

module.exports = { logAudit, auditMiddleware, writeAuditTrail, listAuditTrail, isSensitiveAction };
