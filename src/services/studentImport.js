const prisma = require('../config/database');
const { logAudit } = require('../utils/audit');
const { parseGender } = require('../../services/ClassService');
const { normalizeNationalMatricule } = require('../utils/nationalMatricule');
const {
  parseCsv,
  parseXlsx,
  prepareStudentRows,
  detectImportKind,
} = require('../utils/csvStudents');

async function parseImportRows(file) {
  const kind = detectImportKind(file);
  if (!kind) {
    return {
      ok: false,
      error: 'file',
      status: 400,
      message: 'Format non pris en charge. Utilisez un fichier CSV ou Excel (.xlsx).',
    };
  }

  try {
    if (kind === 'xlsx') {
      const { rows } = await parseXlsx(file.buffer);
      return { ok: true, kind, rows };
    }
    const { rows } = parseCsv(file.buffer.toString('utf-8'));
    return { ok: true, kind, rows };
  } catch (err) {
    console.error(err);
    return {
      ok: false,
      error: 'file',
      status: 400,
      message: kind === 'xlsx'
        ? 'Fichier Excel illisible. Téléchargez le modèle et réessayez.'
        : 'Fichier CSV illisible. Vérifiez le format du fichier.',
    };
  }
}

async function importStudentsFromFile({ schoolId, file, user, ip } = {}) {
  if (!schoolId) return { ok: false, error: 'forbidden', status: 403 };

  if (!file?.buffer || !file.buffer.length) {
    return {
      ok: false,
      error: 'file',
      status: 400,
      message: 'Fichier CSV ou Excel (.xlsx) requis',
    };
  }

  const parsed = await parseImportRows(file);
  if (!parsed.ok) return parsed;
  if (!parsed.rows.length) {
    return {
      ok: false,
      error: 'file',
      status: 400,
      message: 'Le fichier est vide',
    };
  }

  const [classes, existing] = await Promise.all([
    prisma.class.findMany({ where: { schoolId } }),
    prisma.student.findMany({
      where: { schoolId },
      select: { matricule: true, nationalMatricule: true },
    }),
  ]);

  const existingMatricules = new Set(
    existing.filter((s) => s.matricule).map((s) => s.matricule.toLowerCase()),
  );
  const existingNationalMatricules = new Set(
    existing.filter((s) => s.nationalMatricule).map((s) => s.nationalMatricule.toLowerCase()),
  );
  const { valid, errors } = prepareStudentRows(
    parsed.rows,
    classes,
    existingMatricules,
    existingNationalMatricules,
  );

  if (valid.length) {
    await prisma.$transaction(
      valid.map((row) => prisma.student.create({
        data: {
          firstName: row.firstName,
          lastName: row.lastName,
          matricule: row.matricule,
          nationalMatricule: normalizeNationalMatricule(row.nationalMatricule),
          classId: row.classId,
          schoolId,
          birthDate: row.birthDate,
          gender: parseGender(row.gender),
        },
      })),
    );
    await logAudit({
      action: 'students_import',
      entity: 'Student',
      entityId: schoolId,
      user,
      ip,
      details: { count: valid.length, format: parsed.kind },
    });
  }

  return {
    ok: true,
    imported: valid.length,
    skipped: errors.length,
    errors,
    format: parsed.kind,
  };
}

module.exports = {
  importStudentsFromFile,
  parseImportRows,
};
