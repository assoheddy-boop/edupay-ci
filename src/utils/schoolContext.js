const prisma = require('../config/database');
const { resolveSchoolId } = require('../middleware/modules');

/**
 * École active pour la requête (cookie selectedSchoolId, query schoolId, ou affectation staff).
 */
async function resolveActiveSchoolId(req) {
  if (!req?.user) return null;
  return resolveSchoolId(req.user, req);
}

/**
 * Objet School correspondant à l'établissement actif (multi-campus staff).
 */
async function resolveActiveSchool(req) {
  const schoolId = await resolveActiveSchoolId(req);
  if (!schoolId) return null;

  if (req.user?.school?.id === schoolId) return req.user.school;

  const fromStaff = req.user?.staffAssignments?.find((a) => a.schoolId === schoolId)?.school;
  if (fromStaff) return fromStaff;

  if (req.user?.teacher?.schoolId === schoolId && req.user.teacher?.school) {
    return req.user.teacher.school;
  }

  return prisma.school.findUnique({ where: { id: schoolId } });
}

module.exports = {
  resolveActiveSchoolId,
  resolveActiveSchool,
};
