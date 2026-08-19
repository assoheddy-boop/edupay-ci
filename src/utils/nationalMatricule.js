/**
 * Matricule national MEN (collèges-lycées CI).
 * Distinct du matricule école (Student.matricule, ex. IG-DEMO-*).
 */

function normalizeNationalMatricule(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  return value.slice(0, 48);
}

function uniqueTargetIncludes(err, field) {
  const target = err?.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  return String(target || '').includes(field);
}

function uniqueStudentError(err) {
  if (err?.code !== 'P2002') return null;
  if (uniqueTargetIncludes(err, 'nationalMatricule')) return 'nationalMatricule';
  return 'matricule';
}

async function findNationalMatriculeConflict({
  prisma,
  schoolId,
  nationalMatricule,
  excludeId,
} = {}) {
  const value = normalizeNationalMatricule(nationalMatricule);
  if (!value || !schoolId) return null;

  const where = {
    schoolId,
    nationalMatricule: { equals: value, mode: 'insensitive' },
  };
  if (excludeId) where.id = { not: excludeId };

  return prisma.student.findFirst({
    where,
    select: { id: true, schoolId: true, nationalMatricule: true },
  });
}

async function assertNationalMatriculeAvailable(opts) {
  const conflict = await findNationalMatriculeConflict(opts);
  if (!conflict) return { ok: true };
  return { ok: false, error: 'nationalMatricule' };
}

module.exports = {
  normalizeNationalMatricule,
  uniqueTargetIncludes,
  uniqueStudentError,
  findNationalMatriculeConflict,
  assertNationalMatriculeAvailable,
};
