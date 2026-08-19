const {
  computeWeightedAverage,
  computeAnnuelleAverage,
  loadSchoolCoefficients,
} = require('./gradesAverage');
const { filterGradesForBulletin, formatTermLabel } = require('./academicTerms');

const PASSING = 10;
const MAJORS = 14;

function emptyStats() {
  return {
    hasData: false,
    term: null,
    termLabel: null,
    evaluatedCount: 0,
    successRate: null,
    overallAverage: null,
    overallAverageText: null,
    majorsCount: null,
    successLabel: null,
    averageLabel: null,
    majorsLabel: null,
  };
}

function studentTermAverage(grades, term, coeffMap) {
  const list = Array.isArray(grades) ? grades : [];
  if (term === 'ANNUELLE') {
    const hasTerm = ['T1', 'T2', 'T3'].some((t) => filterGradesForBulletin(list, t).length);
    if (hasTerm) return computeAnnuelleAverage(list, coeffMap);
    const other = filterGradesForBulletin(list, 'AUTRE');
    return other.length ? computeWeightedAverage(other, coeffMap) : null;
  }
  const termGrades = filterGradesForBulletin(list, term);
  if (!termGrades.length) return null;
  return computeWeightedAverage(termGrades, coeffMap);
}

function formatPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return `${Math.round(Number(n))}\u00a0%`;
}

function formatMoyenne(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return `${Number(n).toFixed(1).replace('.', ',')}/20`;
}

/**
 * Agrégats anonymes uniquement : moyennes, taux, effectifs.
 * Jamais de nom, matricule, bulletin ou rang.
 */
function aggregateAverages(averages, term) {
  const values = (averages || []).filter((n) => n != null && Number.isFinite(Number(n))).map(Number);
  if (!values.length) return emptyStats();
  const evaluatedCount = values.length;
  const passing = values.filter((n) => n >= PASSING).length;
  const majorsCount = values.filter((n) => n >= MAJORS).length;
  const overallAverage = Math.round((values.reduce((s, n) => s + n, 0) / evaluatedCount) * 10) / 10;
  const successRate = Math.round((passing / evaluatedCount) * 100);
  const termLabel = term ? formatTermLabel(term) : null;
  return {
    hasData: true,
    term: term || null,
    termLabel,
    evaluatedCount,
    successRate,
    overallAverage,
    overallAverageText: formatMoyenne(overallAverage),
    majorsCount,
    successLabel: term
      ? `Taux de réussite ${term} : ${formatPct(successRate)}`
      : `Taux de réussite : ${formatPct(successRate)}`,
    averageLabel: `Moyenne générale ${formatMoyenne(overallAverage)}`,
    majorsLabel: `Mentions Bien et plus : ${majorsCount} (anonymisé)`,
  };
}

async function publicSchoolStats(schoolId) {
  if (!schoolId) return emptyStats();
  try {
    const prisma = require('../config/database');
    if (typeof prisma?.student?.findMany !== 'function') return emptyStats();
    const [students, coeffMap] = await Promise.all([
      prisma.student.findMany({
        where: { schoolId },
        select: {
          id: true,
          grades: {
            select: {
              subject: true,
              value: true,
              maxValue: true,
              period: true,
              term: true,
              kind: true,
            },
          },
        },
      }),
      loadSchoolCoefficients(schoolId),
    ]);

    const terms = ['T3', 'T2', 'T1', 'ANNUELLE'];
    for (const term of terms) {
      const averages = (students || []).map((row) => studentTermAverage(row.grades, term, coeffMap));
      const stats = aggregateAverages(averages, term);
      if (stats.hasData) return stats;
    }
    return emptyStats();
  } catch {
    return emptyStats();
  }
}

module.exports = {
  PASSING,
  MAJORS,
  emptyStats,
  studentTermAverage,
  aggregateAverages,
  publicSchoolStats,
  formatPct,
  formatMoyenne,
};
