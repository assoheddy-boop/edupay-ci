const prisma = require('../config/database');
const { logAudit } = require('../utils/audit');
const { parseGender } = require('../../services/ClassService');
const { normalizeNationalMatricule } = require('../utils/nationalMatricule');
const {
  parseBirthDate,
  normalizeImportGender,
} = require('../utils/csvStudents');

const AGFNE_HEADER_ALIASES = {
  prenom: 'firstName',
  prénom: 'firstName',
  prenoms: 'firstName',
  prénoms: 'firstName',
  firstname: 'firstName',
  first_name: 'firstName',
  nom: 'lastName',
  lastname: 'lastName',
  last_name: 'lastName',
  nom_eleve: 'lastName',
  matricule: 'matricule',
  matricule_ecole: 'matricule',
  'matricule ecole': 'matricule',
  matricule_national: 'nationalMatricule',
  'matricule national': 'nationalMatricule',
  matriculenational: 'nationalMatricule',
  matricule_men: 'nationalMatricule',
  men: 'nationalMatricule',
  id_national: 'nationalMatricule',
  classe: 'className',
  libelle_classe: 'className',
  'libellé classe': 'className',
  class: 'className',
  class_name: 'className',
  niveau: 'className',
  date_naissance: 'birthDate',
  date_de_naissance: 'birthDate',
  datenaissance: 'birthDate',
  birthdate: 'birthDate',
  birth_date: 'birthDate',
  naissance: 'birthDate',
  genre: 'gender',
  gender: 'gender',
  sexe: 'gender',
  nationalite: 'nationality',
  nationalité: 'nationality',
  nationality: 'nationality',
  ecole: 'schoolName',
  école: 'schoolName',
  etablissement: 'schoolName',
  établissement: 'schoolName',
};

const CANONICAL_FIELDS = new Set([
  'firstName', 'lastName', 'matricule', 'nationalMatricule', 'className',
  'birthDate', 'gender', 'nationality', 'schoolName', 'lineNumber',
]);

function normalizeHeaderKey(raw) {
  const text = String(raw ?? '').replace(/^\ufeff/, '').trim();
  if (CANONICAL_FIELDS.has(text)) return text;
  const key = text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
  return AGFNE_HEADER_ALIASES[key] || AGFNE_HEADER_ALIASES[text.toLowerCase()] || key;
}

function normalizeAgfneHeaders(headers) {
  return headers.map(normalizeHeaderKey);
}

function normalizeAgfneRow(row, lineNumber) {
  const out = { lineNumber: lineNumber || row.lineNumber || 0 };
  Object.entries(row || {}).forEach(([key, value]) => {
    if (key === 'lineNumber') return;
    const normalized = normalizeHeaderKey(key);
    if (!out[normalized]) out[normalized] = value;
  });
  return out;
}

function inferClassLevel(className) {
  const name = String(className || '').trim();
  if (!name) return 'Non classé';
  const match = name.match(/^(\d+(?:\s*(?:ème|eme|e|er|ère|ere|nd|rd|th))?|[A-Z]{2,3}\d?|\d+[A-Z]?)/i);
  if (match) return match[1].replace(/\s+/g, ' ').trim();
  const parts = name.split(/\s+/);
  return parts[0] || 'Non classé';
}

function buildClassMap(classes) {
  const map = new Map();
  classes.forEach((c) => {
    map.set(c.name.trim().toLowerCase(), c);
  });
  return map;
}

function findExistingStudent(existingByMatricule, existingByNational, row) {
  const matricule = row.matricule?.trim();
  const national = row.nationalMatricule?.trim();
  if (national) {
    const hit = existingByNational.get(national.toLowerCase());
    if (hit) return hit;
  }
  if (matricule) {
    const hit = existingByMatricule.get(matricule.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

function mapAgfneRow(row) {
  const firstName = String(row.firstName || '').trim();
  const lastName = String(row.lastName || '').trim();
  const className = String(row.className || '').trim();
  const matricule = String(row.matricule || '').trim() || null;
  const nationalMatricule = normalizeNationalMatricule(row.nationalMatricule);
  const birthRaw = row.birthDate == null ? '' : String(row.birthDate).trim();
  const nationality = String(row.nationality || '').trim() || 'Ivoirienne';
  const genderResult = normalizeImportGender(row.gender);

  const errors = [];
  if (!firstName || !lastName) errors.push('Nom et prénom(s) obligatoires');
  if (!className) errors.push('Classe manquante');
  if (birthRaw && !parseBirthDate(birthRaw)) errors.push(`Date de naissance invalide : ${birthRaw}`);
  if (!genderResult.ok) errors.push(`Sexe invalide : ${row.gender}`);

  return {
    lineNumber: row.lineNumber,
    firstName,
    lastName,
    className,
    matricule,
    nationalMatricule,
    birthDate: parseBirthDate(birthRaw),
    gender: genderResult.gender,
    nationality,
    errors,
    valid: errors.length === 0,
  };
}

function previewAgfneRows(rows, classes, existingStudents = []) {
  const classMap = buildClassMap(classes);
  const existingByMatricule = new Map();
  const existingByNational = new Map();
  existingStudents.forEach((s) => {
    if (s.matricule) existingByMatricule.set(s.matricule.toLowerCase(), s);
    if (s.nationalMatricule) existingByNational.set(s.nationalMatricule.toLowerCase(), s);
  });

  return rows.map((row) => {
    const mapped = mapAgfneRow(row);
    const existing = mapped.valid
      ? findExistingStudent(existingByMatricule, existingByNational, mapped)
      : null;
    const classExists = mapped.className
      ? classMap.has(mapped.className.toLowerCase())
      : false;

    return {
      ...mapped,
      action: existing ? 'update' : 'create',
      classExists,
      existingId: existing?.id || null,
    };
  });
}

async function resolveOrCreateClass({ tx, schoolId, schoolYear, className, classMap, createMissing }) {
  const key = className.trim().toLowerCase();
  const found = classMap.get(key);
  if (found) return found.id;

  if (!createMissing) return null;

  const created = await tx.class.create({
    data: {
      name: className.trim(),
      level: inferClassLevel(className),
      schoolYear,
      schoolId,
    },
  });
  classMap.set(key, created);
  return created.id;
}

async function applyAgfneImport({
  schoolId,
  schoolYear,
  rows,
  user,
  ip,
  filename,
  createMissingClasses = true,
} = {}) {
  if (!schoolId || !rows?.length) {
    return { ok: false, error: 'data', status: 400, message: 'Aucune ligne à importer.' };
  }

  const [classes, existingStudents] = await Promise.all([
    prisma.class.findMany({ where: { schoolId } }),
    prisma.student.findMany({
      where: { schoolId },
      select: {
        id: true,
        matricule: true,
        nationalMatricule: true,
      },
    }),
  ]);

  const classMap = buildClassMap(classes);
  const existingByMatricule = new Map();
  const existingByNational = new Map();
  existingStudents.forEach((s) => {
    if (s.matricule) existingByMatricule.set(s.matricule.toLowerCase(), s);
    if (s.nationalMatricule) existingByNational.set(s.nationalMatricule.toLowerCase(), s);
  });

  let created = 0;
  let updated = 0;
  const errors = [];

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const mapped = mapAgfneRow(row);
      if (!mapped.valid) {
        errors.push({ line: mapped.lineNumber, message: mapped.errors.join(' ; ') });
        continue;
      }

      const classId = await resolveOrCreateClass({
        tx,
        schoolId,
        schoolYear,
        className: mapped.className,
        classMap,
        createMissing: createMissingClasses,
      });
      if (!classId) {
        errors.push({ line: mapped.lineNumber, message: `Classe introuvable : « ${mapped.className} »` });
        continue;
      }

      const existing = findExistingStudent(existingByMatricule, existingByNational, mapped);
      const studentData = {
        firstName: mapped.firstName,
        lastName: mapped.lastName,
        matricule: mapped.matricule,
        nationalMatricule: mapped.nationalMatricule,
        birthDate: mapped.birthDate,
        gender: parseGender(mapped.gender),
        nationality: mapped.nationality,
        classId,
        schoolId,
      };

      if (existing) {
        await tx.student.update({
          where: { id: existing.id },
          data: studentData,
        });
        updated += 1;
      } else {
        const createdStudent = await tx.student.create({ data: studentData });
        if (mapped.matricule) {
          existingByMatricule.set(mapped.matricule.toLowerCase(), createdStudent);
        }
        if (mapped.nationalMatricule) {
          existingByNational.set(mapped.nationalMatricule.toLowerCase(), createdStudent);
        }
        created += 1;
      }
    }
  });

  await logAudit({
    action: 'agfne_import',
    entity: 'Student',
    entityId: schoolId,
    user,
    ip,
    details: { filename, created, updated, errors: errors.length },
  });

  return {
    ok: true,
    created,
    updated,
    errors,
    rowCount: rows.length,
  };
}

module.exports = {
  AGFNE_HEADER_ALIASES,
  normalizeHeaderKey,
  normalizeAgfneHeaders,
  normalizeAgfneRow,
  mapAgfneRow,
  previewAgfneRows,
  applyAgfneImport,
  inferClassLevel,
};
