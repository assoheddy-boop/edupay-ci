const prisma = require('../config/database');

async function logAudit({ action, entity, entityId, user, details, ip, schoolId }) {
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

module.exports = { logAudit, auditMiddleware };
