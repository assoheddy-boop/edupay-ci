const prisma = require('../src/config/database');
const logger = require('./logger');
const {
  analyzeRedoublementCauses,
  getReinscriptionStats,
  summarizeCauseStats,
  ABSENCE_THRESHOLD,
  GRADE_THRESHOLD,
} = require('./ReinscriptionService');

/** Écoles sans plan assigné — regroupées sous ce libellé (pas de défaut Essentiel implicite). */
const NO_PLAN_LABEL = 'Sans plan';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function pct(part, total) {
  return total ? round2(part / total) : 0;
}

function causeRatesFromStats(causeStats, totalCauses) {
  if (!totalCauses) {
    return { absencesRate: 0, notesRate: 0, mixteRate: 0, autreRate: 0 };
  }
  return {
    absencesRate: pct(causeStats.absences, totalCauses),
    notesRate: pct(causeStats.notes, totalCauses),
    mixteRate: pct(causeStats.mixte, totalCauses),
    autreRate: pct(causeStats.autre, totalCauses),
  };
}

function aggregateGenderFromCauses(causes) {
  const split = { boys: 0, girls: 0, other: 0, total: 0 };
  causes.forEach((c) => {
    if (c.gender === 'M') split.boys += 1;
    else if (c.gender === 'F') split.girls += 1;
    else split.other += 1;
  });
  split.total = split.boys + split.girls + split.other;
  split.boysPct = split.total ? round2(split.boys / split.total) : 0;
  split.girlsPct = split.total ? round2(split.girls / split.total) : 0;
  return split;
}

function planKeyForSchool(school) {
  if (school.plan?.name) return school.plan.name;
  return NO_PLAN_LABEL;
}

async function analyzeSchoolRedoublement(school, schoolYear) {
  const [causes, reinscriptionStats, yearRecords] = await Promise.all([
    analyzeRedoublementCauses(schoolYear, school.id),
    getReinscriptionStats(school.id, schoolYear),
    prisma.studentYearRecord.findMany({
      where: { schoolId: school.id, schoolYear },
      select: { repeatYear: true },
    }),
  ]);

  const totalRecords = yearRecords.length;
  const repeaters = yearRecords.filter((r) => r.repeatYear).length;
  const repeatRate = totalRecords ? round2(repeaters / totalRecords) : 0;
  const causeStats = summarizeCauseStats(causes);
  const totalCauses = causes.length;
  const causeRates = causeRatesFromStats(causeStats, totalCauses);

  return {
    schoolId: school.id,
    schoolName: school.name,
    planName: planKeyForSchool(school),
    planId: school.planId || null,
    totalStudents: totalRecords,
    repeaters,
    repeatRate,
    totalRedoublants: totalCauses,
    causeStats,
    ...causeRates,
    genderSplit: aggregateGenderFromCauses(causes),
    historicalRepeatRate: reinscriptionStats.historicalRepeatRate || [],
  };
}

function mergePlanBucket(existing, schoolRow) {
  const bucket = existing || {
    planName: schoolRow.planName,
    planId: schoolRow.planId,
    schoolCount: 0,
    totalStudents: 0,
    repeaters: 0,
    totalRedoublants: 0,
    causeStats: { absences: 0, notes: 0, mixte: 0, autre: 0 },
    genderSplit: { boys: 0, girls: 0, other: 0, total: 0 },
    schools: [],
    historicalByYear: {},
  };

  bucket.schoolCount += 1;
  bucket.totalStudents += schoolRow.totalStudents;
  bucket.repeaters += schoolRow.repeaters;
  bucket.totalRedoublants += schoolRow.totalRedoublants;
  bucket.causeStats.absences += schoolRow.causeStats.absences;
  bucket.causeStats.notes += schoolRow.causeStats.notes;
  bucket.causeStats.mixte += schoolRow.causeStats.mixte;
  bucket.causeStats.autre += schoolRow.causeStats.autre;
  bucket.genderSplit.boys += schoolRow.genderSplit.boys;
  bucket.genderSplit.girls += schoolRow.genderSplit.girls;
  bucket.genderSplit.other += schoolRow.genderSplit.other;
  bucket.schools.push({
    schoolId: schoolRow.schoolId,
    schoolName: schoolRow.schoolName,
    repeatRate: schoolRow.repeatRate,
    repeaters: schoolRow.repeaters,
    totalStudents: schoolRow.totalStudents,
  });

  (schoolRow.historicalRepeatRate || []).forEach((h) => {
    if (!bucket.historicalByYear[h.schoolYear]) {
      bucket.historicalByYear[h.schoolYear] = { total: 0, repeated: 0 };
    }
    bucket.historicalByYear[h.schoolYear].total += h.total;
    bucket.historicalByYear[h.schoolYear].repeated += h.repeated;
  });

  return bucket;
}

function finalizePlanBucket(bucket) {
  const genderTotal = bucket.genderSplit.boys + bucket.genderSplit.girls + bucket.genderSplit.other;
  const causeRates = causeRatesFromStats(bucket.causeStats, bucket.totalRedoublants);
  const avgRedoublementRate = bucket.totalStudents
    ? round2(bucket.repeaters / bucket.totalStudents)
    : 0;

  const historicalRates = Object.entries(bucket.historicalByYear)
    .map(([year, data]) => ({
      schoolYear: year,
      total: data.total,
      repeated: data.repeated,
      rate: data.total ? round2(data.repeated / data.total) : 0,
    }))
    .sort((a, b) => a.schoolYear.localeCompare(b.schoolYear));

  return {
    planName: bucket.planName,
    planId: bucket.planId,
    schoolCount: bucket.schoolCount,
    totalStudents: bucket.totalStudents,
    repeaters: bucket.repeaters,
    avgRedoublementRate,
    efficient: avgRedoublementRate < 0.10,
    totalRedoublants: bucket.totalRedoublants,
    causeStats: bucket.causeStats,
    ...causeRates,
    genderSplit: {
      ...bucket.genderSplit,
      total: genderTotal,
      boysPct: genderTotal ? round2(bucket.genderSplit.boys / genderTotal) : 0,
      girlsPct: genderTotal ? round2(bucket.genderSplit.girls / genderTotal) : 0,
    },
    historicalRates,
    schools: bucket.schools.sort((a, b) => b.repeatRate - a.repeatRate),
  };
}

/**
 * Agrège les causes de redoublement par formule d'abonnement pour une année scolaire.
 * Les écoles sans planId sont regroupées sous « Sans plan ».
 */
async function getRedoublementCausesByPlan(schoolYear) {
  if (!schoolYear) {
    return { ok: false, error: 'data', plans: [], schoolYear: null };
  }

  try {
    const schools = await prisma.school.findMany({
      include: { plan: true },
      orderBy: { name: 'asc' },
    });

    const schoolRows = await Promise.all(
      schools.map((school) => analyzeSchoolRedoublement(school, schoolYear)),
    );

    const planMap = {};
    schoolRows.forEach((row) => {
      const key = row.planName;
      planMap[key] = mergePlanBucket(planMap[key], row);
    });

    const plans = Object.values(planMap)
      .map(finalizePlanBucket)
      .sort((a, b) => a.planName.localeCompare(b.planName, 'fr'));

    return {
      ok: true,
      schoolYear,
      noPlanLabel: NO_PLAN_LABEL,
      plans,
      thresholds: { absences: ABSENCE_THRESHOLD, grade: GRADE_THRESHOLD },
    };
  } catch (err) {
    logger.error('getRedoublementCausesByPlan failed', { error: err.message, schoolYear });
    return {
      ok: false,
      error: 'stats',
      schoolYear,
      plans: [],
      thresholds: { absences: ABSENCE_THRESHOLD, grade: GRADE_THRESHOLD },
    };
  }
}

module.exports = {
  getRedoublementCausesByPlan,
  NO_PLAN_LABEL,
  analyzeSchoolRedoublement,
  causeRatesFromStats,
};
