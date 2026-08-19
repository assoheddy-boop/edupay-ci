const prisma = require('../config/database');
const { TERMS, formatTermLabel, normalizeTerm, filterGradesForBulletin } = require('./academicTerms');
const { computeWeightedAverage, loadSchoolCoefficients, round2 } = require('./gradesAverage');
const { termDateRange, getClassForSchool } = require('./deliberationService');

/**
 * Score pédagogique transparent (pas un modèle d’IA).
 * Moyenne = formule collège CI (sprints 1 + 5) : moyenne matière
 * (interro + devoir + composition) / n, puis Σ(note × coef) / Σ(coef).
 *
 * Élevé  : moyenne < 10/20  OU  absences ≥ 6  OU  retards ≥ 8 (trimestre)
 * Moyen  : moyenne < 12     OU  absences ≥ 3  OU  retards ≥ 4  OU  pas de notes
 * Faible : sinon
 *
 * Pénalités (plafond 100) : moyenne <10 → +50 ; 10≤m<12 → +25 ; pas de notes → +20 ;
 * absences ≥6 → +40 ; 3–5 → +20 ; retards ≥8 → +20 ; 4–7 → +10.
 */
const RISK_THRESHOLDS = {
  averageHigh: 10,
  averageMedium: 12,
  absencesHigh: 6,
  absencesMedium: 3,
  latesHigh: 8,
  latesMedium: 4,
};

const RISK_LEVEL = {
  ELEVE: 'ELEVE',
  MOYEN: 'MOYEN',
  FAIBLE: 'FAIBLE',
};

const RISK_LABELS = {
  ELEVE: 'Élevé',
  MOYEN: 'Moyen',
  FAIBLE: 'Faible',
};

const LEVEL_RANK = { ELEVE: 0, MOYEN: 1, FAIBLE: 2 };

const SCHOOL_TOP_N = 40;
const WIDGET_TOP_N = 5;

function formatAverageFr(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Number(value).toFixed(1).replace('.', ',');
}

function pluralFr(n, singular, plural) {
  const count = Number(n) || 0;
  return `${count} ${count > 1 ? plural : singular}`;
}

function riskMotif({ average, absences, lates, hasGrades }) {
  const parts = [];
  if (hasGrades && average != null) parts.push(`moyenne ${formatAverageFr(average)}`);
  else parts.push('pas de notes');
  if (absences) parts.push(pluralFr(absences, 'absence', 'absences'));
  if (lates) parts.push(pluralFr(lates, 'retard', 'retards'));
  return parts.join(' · ');
}

function countAbsencesOfType(absences, range, type) {
  const list = Array.isArray(absences) ? absences : [];
  return list.filter((a) => {
    const t = a.type || 'ABSENCE';
    if (t !== type) return false;
    if (!range) return true;
    const d = new Date(a.date);
    return d >= range.start && d <= range.end;
  }).length;
}

function pickLatestTerm(grades) {
  const terms = new Set((Array.isArray(grades) ? grades : []).map((g) => normalizeTerm(g.term || g.period)));
  if (terms.has('T3')) return 'T3';
  if (terms.has('T2')) return 'T2';
  if (terms.has('T1')) return 'T1';
  return null;
}

function termForDate(date, schoolYear) {
  const d = date instanceof Date ? date : new Date(date);
  for (const t of ['T1', 'T2', 'T3']) {
    const range = termDateRange(schoolYear, t);
    if (range && d >= range.start && d <= range.end) return t;
  }
  return null;
}

function resolveRiskTerm({ term, schoolYear, grades } = {}) {
  const raw = term == null ? '' : String(term).trim();
  if (raw) {
    const n = normalizeTerm(raw);
    if (['T1', 'T2', 'T3'].includes(n)) return n;
  }
  return termForDate(new Date(), schoolYear) || pickLatestTerm(grades) || 'T1';
}

function scoreStudentRisk({ average, absences = 0, lates = 0, hasGrades = false } = {}) {
  const abs = Number(absences) || 0;
  const late = Number(lates) || 0;
  const avg = hasGrades && average != null && Number.isFinite(Number(average))
    ? Number(average)
    : null;

  let score = 0;
  if (!hasGrades || avg == null) score += 20;
  else if (avg < RISK_THRESHOLDS.averageHigh) score += 50;
  else if (avg < RISK_THRESHOLDS.averageMedium) score += 25;

  if (abs >= RISK_THRESHOLDS.absencesHigh) score += 40;
  else if (abs >= RISK_THRESHOLDS.absencesMedium) score += 20;

  if (late >= RISK_THRESHOLDS.latesHigh) score += 20;
  else if (late >= RISK_THRESHOLDS.latesMedium) score += 10;

  if (score > 100) score = 100;

  const high = (avg != null && avg < RISK_THRESHOLDS.averageHigh)
    || abs >= RISK_THRESHOLDS.absencesHigh
    || late >= RISK_THRESHOLDS.latesHigh;
  const medium = !high && (
    !hasGrades
    || avg == null
    || avg < RISK_THRESHOLDS.averageMedium
    || abs >= RISK_THRESHOLDS.absencesMedium
    || late >= RISK_THRESHOLDS.latesMedium
  );
  const level = high ? RISK_LEVEL.ELEVE : medium ? RISK_LEVEL.MOYEN : RISK_LEVEL.FAIBLE;

  return {
    score,
    level,
    label: RISK_LABELS[level],
    motif: riskMotif({ average: avg, absences: abs, lates: late, hasGrades }),
  };
}

function compareRiskRows(a, b) {
  const rank = (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9);
  if (rank !== 0) return rank;
  if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
  const last = String(a.lastName || '').localeCompare(String(b.lastName || ''), 'fr');
  if (last !== 0) return last;
  return String(a.firstName || '').localeCompare(String(b.firstName || ''), 'fr');
}

function countLevels(rows) {
  const counts = { ELEVE: 0, MOYEN: 0, FAIBLE: 0 };
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (counts[row.level] != null) counts[row.level] += 1;
  });
  return counts;
}

function riskRow({ student, coeffMap, term, range }) {
  const grades = student.grades || [];
  const termGrades = filterGradesForBulletin(grades, term);
  const hasGrades = termGrades.length > 0;
  const average = hasGrades ? computeWeightedAverage(termGrades, coeffMap) : null;
  const absences = countAbsencesOfType(student.absences, range, 'ABSENCE');
  const lates = countAbsencesOfType(student.absences, range, 'LATE');
  const scored = scoreStudentRisk({ average, absences, lates, hasGrades });
  return {
    studentId: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    matricule: student.matricule || '',
    classId: student.classId || student.class?.id || '',
    className: student.class?.name || '—',
    average: average == null ? null : round2(average),
    hasGrades,
    absences,
    lates,
    score: scored.score,
    level: scored.level,
    label: scored.label,
    motif: scored.motif,
  };
}

function emptyBoard({ term = 'T1', schoolYear = '2025-2026' } = {}) {
  return {
    ok: true,
    class: null,
    term,
    schoolYear,
    thresholds: RISK_THRESHOLDS,
    rows: [],
    totalStudents: 0,
    truncated: false,
    counts: { ELEVE: 0, MOYEN: 0, FAIBLE: 0 },
  };
}

async function getRiskBoard({
  schoolId,
  classId,
  classIds,
  term,
  schoolYear,
  topN,
} = {}) {
  if (!schoolId) return { ok: false, error: 'forbidden', status: 403 };

  const requestedClassId = String(classId || '').trim();
  let klass = null;
  if (requestedClassId) {
    klass = await getClassForSchool(schoolId, requestedClassId);
    if (!klass) return { ok: false, error: 'forbidden', status: 403 };
    if (Array.isArray(classIds) && classIds.length && !classIds.includes(klass.id)) {
      return { ok: false, error: 'forbidden', status: 403 };
    }
  }

  const year = String(schoolYear || klass?.schoolYear || klass?.school?.currentSchoolYear || '').trim()
    || '2025-2026';

  if (classIds !== undefined && !klass) {
    if (!Array.isArray(classIds) || !classIds.length) {
      return emptyBoard({
        term: resolveRiskTerm({ term, schoolYear: year, grades: [] }),
        schoolYear: year,
      });
    }
  }

  const coeffMap = await loadSchoolCoefficients(schoolId);

  const studentWhere = { schoolId };
  if (klass) studentWhere.classId = klass.id;
  else if (Array.isArray(classIds) && classIds.length) studentWhere.classId = { in: classIds };

  const students = await prisma.student.findMany({
    where: studentWhere,
    include: {
      class: { select: { id: true, name: true } },
      grades: true,
      absences: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  const allGrades = students.flatMap((s) => s.grades || []);
  const resolvedTerm = resolveRiskTerm({ term, schoolYear: year, grades: allGrades });
  const range = termDateRange(year, resolvedTerm);

  const rows = students.map((student) => riskRow({
    student,
    coeffMap,
    term: resolvedTerm,
    range,
  }));
  rows.sort(compareRiskRows);

  const limit = Number.isFinite(Number(topN)) ? Number(topN) : (klass ? 0 : SCHOOL_TOP_N);
  const displayRows = limit > 0 ? rows.slice(0, limit) : rows;

  return {
    ok: true,
    class: klass,
    term: resolvedTerm,
    schoolYear: year,
    thresholds: RISK_THRESHOLDS,
    rows: displayRows,
    totalStudents: rows.length,
    truncated: displayRows.length < rows.length,
    counts: countLevels(rows),
    coeffMap,
  };
}

async function getRiskSummary({ schoolId, schoolYear, classId, classIds, topN = WIDGET_TOP_N } = {}) {
  const board = await getRiskBoard({
    schoolId,
    schoolYear,
    classId,
    classIds,
    topN: 0,
  });
  if (!board.ok) return emptyBoard({ schoolYear });
  const watch = (board.rows || []).filter((r) => r.level !== 'FAIBLE');
  const limit = Number(topN) > 0 ? Number(topN) : WIDGET_TOP_N;
  return {
    ...board,
    rows: watch.slice(0, limit),
  };
}

module.exports = {
  RISK_THRESHOLDS,
  RISK_LEVEL,
  RISK_LABELS,
  SCHOOL_TOP_N,
  WIDGET_TOP_N,
  TERMS,
  formatAverageFr,
  riskMotif,
  countAbsencesOfType,
  pickLatestTerm,
  termForDate,
  resolveRiskTerm,
  scoreStudentRisk,
  compareRiskRows,
  countLevels,
  riskRow,
  getRiskBoard,
  getRiskSummary,
  formatTermLabel,
};
