const { filterGradesForBulletin } = require('./academicTerms');

/** Coefficients collège CI typiques (direction peut les remplacer par école). */
const DEFAULT_COEFFICIENTS = {
  mathematiques: 4,
  maths: 4,
  math: 4,
  francais: 3,
  anglais: 2,
  'histoire geo': 2,
  'histoire geographie': 2,
  svt: 2,
  sciences: 2,
  'physique chimie': 2,
  pc: 2,
  eps: 1,
  espagnol: 2,
  allemand: 2,
  informatique: 1,
  'arts plastiques': 1,
  arts: 1,
  musique: 1,
  ecm: 1,
  'education civique': 1,
  'education civique et morale': 1,
};

const COLLEGE_CI_SUBJECTS = [
  { name: 'Mathématiques', coefficient: 4 },
  { name: 'Français', coefficient: 3 },
  { name: 'Anglais', coefficient: 2 },
  { name: 'Histoire-Géo', coefficient: 2 },
  { name: 'SVT', coefficient: 2 },
  { name: 'Physique-Chimie', coefficient: 2 },
  { name: 'EPS', coefficient: 1 },
  { name: 'Espagnol', coefficient: 2 },
  { name: 'Informatique', coefficient: 1 },
  { name: 'Arts plastiques', coefficient: 1 },
];

function foldSubject(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function parseCoefficient(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return round2(n);
}

function defaultCoefficientFor(subject) {
  const key = foldSubject(subject);
  if (!key) return 1;
  if (DEFAULT_COEFFICIENTS[key] != null) return DEFAULT_COEFFICIENTS[key];
  return 1;
}

function lookupMap(coeffMap, subject) {
  if (!coeffMap || typeof coeffMap !== 'object') return null;
  if (coeffMap[subject] != null) return parseCoefficient(coeffMap[subject]);
  const folded = foldSubject(subject);
  for (const [name, value] of Object.entries(coeffMap)) {
    if (foldSubject(name) === folded) return parseCoefficient(value);
  }
  return null;
}

function getCoefficient(subject, coeffMap) {
  const fromSchool = lookupMap(coeffMap, subject);
  if (fromSchool != null) return fromSchool;
  return defaultCoefficientFor(subject);
}

function gradeOn20(grade) {
  const max = Number(grade?.maxValue);
  if (!max) return 0;
  return (Number(grade.value) / max) * 20;
}

const GRADE_KIND = {
  INTERRO: 'INTERRO',
  DEVOIR: 'DEVOIR',
  COMPOSITION: 'COMPOSITION',
};

const GRADE_KINDS = [
  { value: 'INTERRO', label: 'Interrogation' },
  { value: 'DEVOIR', label: 'Devoir' },
  { value: 'COMPOSITION', label: 'Composition' },
];

const GRADE_KIND_LABELS = {
  INTERRO: 'Interrogation',
  DEVOIR: 'Devoir',
  COMPOSITION: 'Composition',
};

/** Note sans type (lignes historiques) = devoir. */
const DEFAULT_GRADE_KIND = GRADE_KIND.DEVOIR;

/**
 * Formule collège CI (EduConnect) — moyenne matière d’un trimestre :
 *   moy. interrogations = moyenne arithmétique des INTERRO (/20)
 *   moy. devoirs        = moyenne arithmétique des DEVOIR (/20)
 *   composition         = moyenne des COMPOSITION (souvent une note)
 *   moyenne matière     = (parties présentes) / n
 *   n = nombre de types renseignés parmi Interro, Devoir, Composition.
 * Un type absent ne dilue pas la moyenne. Les notes sans kind comptent comme Devoir.
 * La moyenne générale applique ensuite les coefficients matière (sprint 1).
 */
const SUBJECT_AVERAGE_FOOTNOTE =
  'Moyenne matière = (moy. interrogations + moy. devoirs + composition) / n, n = types renseignés. Notes sans type = devoir.';

function normalizeGradeKind(kind) {
  const raw = String(kind || '').trim();
  if (!raw) return DEFAULT_GRADE_KIND;
  const upper = raw.toUpperCase();
  if (upper === GRADE_KIND.INTERRO || upper === GRADE_KIND.DEVOIR || upper === GRADE_KIND.COMPOSITION) {
    return upper;
  }
  const f = foldSubject(raw);
  if (f === 'interro' || f === 'interrogation' || f.startsWith('interro ')) return GRADE_KIND.INTERRO;
  if (f === 'composition' || f === 'compo' || f === 'examen') return GRADE_KIND.COMPOSITION;
  if (f === 'devoir' || f === 'devoirs') return GRADE_KIND.DEVOIR;
  return DEFAULT_GRADE_KIND;
}

function gradeKindLabel(kind) {
  return GRADE_KIND_LABELS[normalizeGradeKind(kind)] || GRADE_KIND_LABELS.DEVOIR;
}

function meanOn20(notes) {
  const list = Array.isArray(notes) ? notes : [];
  if (!list.length) return null;
  const sum = list.reduce((s, g) => s + gradeOn20(g), 0);
  return round2(sum / list.length);
}

function computeKindParts(notes) {
  const buckets = {
    INTERRO: [],
    DEVOIR: [],
    COMPOSITION: [],
  };
  (Array.isArray(notes) ? notes : []).forEach((g) => {
    buckets[normalizeGradeKind(g.kind)].push(g);
  });
  const interro = meanOn20(buckets.INTERRO);
  const devoir = meanOn20(buckets.DEVOIR);
  const composition = meanOn20(buckets.COMPOSITION);
  const parts = [interro, devoir, composition].filter((n) => n != null);
  const average = parts.length ? round2(parts.reduce((s, n) => s + n, 0) / parts.length) : 0;
  return {
    interro,
    devoir,
    composition,
    average,
    partsCount: parts.length,
  };
}

function computeSubjectRows(grades, coeffMap) {
  const list = Array.isArray(grades) ? grades : [];
  const bySubject = new Map();

  list.forEach((g) => {
    const name = String(g.subject || '').trim() || '—';
    if (!bySubject.has(name)) {
      bySubject.set(name, {
        subject: name,
        coefficient: getCoefficient(name, coeffMap),
        notes: [],
      });
    }
    bySubject.get(name).notes.push(g);
  });

  return [...bySubject.values()].map((row) => {
    const parts = computeKindParts(row.notes);
    const comment = [...row.notes].reverse().find((g) => g.comment)?.comment || null;
    return {
      subject: row.subject,
      coefficient: row.coefficient,
      average: parts.average,
      comment,
      grades: row.notes,
      interro: parts.interro,
      devoir: parts.devoir,
      composition: parts.composition,
      partsCount: parts.partsCount,
    };
  });
}

function computeWeightedAverage(grades, coeffMap) {
  const rows = computeSubjectRows(grades, coeffMap);
  if (!rows.length) return 0;
  let num = 0;
  let den = 0;
  rows.forEach((row) => {
    num += row.average * row.coefficient;
    den += row.coefficient;
  });
  if (!den) return 0;
  return round2(num / den);
}

function computeAverage(grades, coeffMap) {
  const list = Array.isArray(grades) ? grades : [];
  if (!list.length) return 0;
  const studentIds = new Set(list.map((g) => g.studentId).filter(Boolean));
  if (studentIds.size > 1) {
    const byStudent = new Map();
    list.forEach((g) => {
      const id = g.studentId;
      if (!byStudent.has(id)) byStudent.set(id, []);
      byStudent.get(id).push(g);
    });
    const avgs = [...byStudent.values()].map((gs) => computeWeightedAverage(gs, coeffMap));
    return round2(avgs.reduce((sum, n) => sum + n, 0) / avgs.length);
  }
  return computeWeightedAverage(list, coeffMap);
}

function computeTermAverages(grades, coeffMap) {
  return {
    T1: computeWeightedAverage(filterGradesForBulletin(grades, 'T1'), coeffMap),
    T2: computeWeightedAverage(filterGradesForBulletin(grades, 'T2'), coeffMap),
    T3: computeWeightedAverage(filterGradesForBulletin(grades, 'T3'), coeffMap),
  };
}

function computeAnnuelleAverage(grades, coeffMap) {
  const terms = computeTermAverages(grades, coeffMap);
  const present = ['T1', 'T2', 'T3']
    .filter((t) => filterGradesForBulletin(grades, t).length)
    .map((t) => terms[t]);
  if (!present.length) {
    const other = filterGradesForBulletin(grades, 'AUTRE');
    return other.length ? computeWeightedAverage(other, coeffMap) : 0;
  }
  return round2(present.reduce((sum, n) => sum + n, 0) / present.length);
}

function coefficientMapFromSubjects(subjects) {
  const map = {};
  (subjects || []).forEach((s) => {
    if (!s?.name) return;
    const coeff = parseCoefficient(s.coefficient);
    if (coeff != null) map[s.name] = coeff;
  });
  return map;
}

function getPrisma() {
  return require('../config/database');
}

async function loadSchoolCoefficients(schoolId) {
  if (!schoolId) return {};
  try {
    const subjects = await getPrisma().subject.findMany({
      where: { schoolId },
      select: { name: true, coefficient: true },
    });
    return coefficientMapFromSubjects(subjects);
  } catch {
    return {};
  }
}

async function upsertSubjectCoefficient(schoolId, name, coefficient) {
  const trimmed = String(name || '').trim();
  if (!schoolId || !trimmed) return null;
  const coeff = parseCoefficient(coefficient);
  try {
    return await getPrisma().subject.upsert({
      where: { schoolId_name: { schoolId, name: trimmed } },
      create: {
        schoolId,
        name: trimmed,
        coefficient: coeff != null ? coeff : defaultCoefficientFor(trimmed),
      },
      update: coeff != null ? { coefficient: coeff } : {},
    });
  } catch {
    return null;
  }
}

module.exports = {
  DEFAULT_COEFFICIENTS,
  COLLEGE_CI_SUBJECTS,
  GRADE_KIND,
  GRADE_KINDS,
  GRADE_KIND_LABELS,
  DEFAULT_GRADE_KIND,
  SUBJECT_AVERAGE_FOOTNOTE,
  foldSubject,
  round2,
  parseCoefficient,
  defaultCoefficientFor,
  getCoefficient,
  gradeOn20,
  normalizeGradeKind,
  gradeKindLabel,
  meanOn20,
  computeKindParts,
  computeSubjectRows,
  computeWeightedAverage,
  computeAverage,
  computeTermAverages,
  computeAnnuelleAverage,
  coefficientMapFromSubjects,
  loadSchoolCoefficients,
  upsertSubjectCoefficient,
};
