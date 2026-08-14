const prisma = require('../src/config/database');
const logger = require('./logger');
const { PASSING_RATIO } = require('./StatsService');
const { computeAverage } = require('../src/services/bulletinPdf');

/** Seuil absences (jours) au-delà duquel on suspecte un redoublement lié aux absences. */
const ABSENCE_THRESHOLD = 30;
/** Seuil moyenne (/20) en dessous duquel on suspecte un redoublement lié aux notes. */
const GRADE_THRESHOLD = 10;

const RECORD_INCLUDE = {
  student: { select: { id: true, firstName: true, lastName: true, gender: true, classId: true } },
  class: { select: { id: true, name: true, level: true, schoolYear: true } },
};

/** Sans notes : élève considéré non validé (redoublement). Moyenne >= 10/20 si notes présentes. */
function studentValidatedYear(grades) {
  if (!grades || !grades.length) return false;
  const avg = computeAverage(grades);
  return avg >= PASSING_RATIO * 20;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function genderLabel(g) {
  if (g === 'M') return 'Garçon';
  if (g === 'F') return 'Fille';
  return '—';
}

/** Plage calendaire approximative pour une année scolaire « YYYY-YYYY » (sept. → août). */
function schoolYearDateRange(schoolYear) {
  if (!schoolYear || typeof schoolYear !== 'string') return null;
  const m = schoolYear.match(/^(\d{4})-(\d{4})$/);
  if (!m) return null;
  const startYear = parseInt(m[1], 10);
  const endYear = parseInt(m[2], 10);
  if (endYear !== startYear + 1) return null;
  return {
    start: new Date(Date.UTC(startYear, 8, 1)),
    end: new Date(Date.UTC(endYear, 7, 31, 23, 59, 59, 999)),
  };
}

function determineCause(absences, avgGrade, hasGrades) {
  const highAbsences = absences > ABSENCE_THRESHOLD;
  const lowGrades = hasGrades ? avgGrade < GRADE_THRESHOLD : true;

  if (highAbsences && lowGrades) return 'Mixte';
  if (highAbsences) return 'Absences élevées';
  if (lowGrades) return 'Notes faibles';
  return 'Autre';
}

async function countStudentAbsences(studentIds, schoolYear) {
  if (!studentIds.length) return {};

  const range = schoolYearDateRange(schoolYear);
  const where = {
    studentId: { in: studentIds },
    type: 'ABSENCE',
  };
  if (range) {
    where.date = { gte: range.start, lte: range.end };
  }

  const rows = await prisma.absence.findMany({
    where,
    select: { studentId: true },
  });

  const map = {};
  studentIds.forEach((id) => { map[id] = 0; });
  rows.forEach((r) => {
    map[r.studentId] = (map[r.studentId] || 0) + 1;
  });
  return map;
}

async function avgGradesByStudent(studentIds) {
  if (!studentIds.length) return {};

  const rows = await prisma.grade.findMany({
    where: { studentId: { in: studentIds } },
    select: { studentId: true, value: true, maxValue: true },
  });

  const buckets = {};
  studentIds.forEach((id) => { buckets[id] = []; });
  rows.forEach((g) => {
    if (buckets[g.studentId]) buckets[g.studentId].push(g);
  });

  const map = {};
  Object.entries(buckets).forEach(([id, grades]) => {
    map[id] = {
      avgGrade: grades.length ? round2(computeAverage(grades)) : 0,
      hasGrades: grades.length > 0,
    };
  });
  return map;
}

async function analyzeRedoublementCauses(schoolYear, schoolId) {
  if (!schoolId || !schoolYear) return [];

  try {
    const records = await prisma.studentYearRecord.findMany({
      where: { schoolId, schoolYear, repeatYear: true },
      include: RECORD_INCLUDE,
    });

    if (!records.length) return [];

    const studentIds = records.map((r) => r.studentId);
    const [absenceMap, gradeMap] = await Promise.all([
      countStudentAbsences(studentIds, schoolYear),
      avgGradesByStudent(studentIds),
    ]);

    return records.map((r) => {
      const absences = absenceMap[r.studentId] || 0;
      const gradeInfo = gradeMap[r.studentId] || { avgGrade: 0, hasGrades: false };
      const cause = determineCause(absences, gradeInfo.avgGrade, gradeInfo.hasGrades);
      const student = r.student || {};
      const cls = r.class || {};

      return {
        studentId: r.studentId,
        firstName: student.firstName || '',
        lastName: student.lastName || '',
        gender: student.gender || null,
        genderLabel: genderLabel(student.gender),
        classId: r.classId,
        className: cls.name || '—',
        classLevel: cls.level || '',
        repeatYear: true,
        absences,
        avgGrade: gradeInfo.avgGrade,
        cause,
      };
    });
  } catch (err) {
    logger.error('analyzeRedoublementCauses failed', { error: err.message, schoolId, schoolYear });
    return [];
  }
}

async function compareRepeaterAbsences(schoolId, schoolYear) {
  const records = await prisma.studentYearRecord.findMany({
    where: { schoolId, schoolYear },
    select: { studentId: true, repeatYear: true },
  });

  if (!records.length) {
    return { repeatersAvg: 0, nonRepeatersAvg: 0, repeatersCount: 0, nonRepeatersCount: 0 };
  }

  const studentIds = records.map((r) => r.studentId);
  const absenceMap = await countStudentAbsences(studentIds, schoolYear);

  let repeaterTotal = 0;
  let repeaterCount = 0;
  let nonRepeaterTotal = 0;
  let nonRepeaterCount = 0;

  records.forEach((r) => {
    const count = absenceMap[r.studentId] || 0;
    if (r.repeatYear) {
      repeaterTotal += count;
      repeaterCount += 1;
    } else {
      nonRepeaterTotal += count;
      nonRepeaterCount += 1;
    }
  });

  return {
    repeatersAvg: repeaterCount ? round2(repeaterTotal / repeaterCount) : 0,
    nonRepeatersAvg: nonRepeaterCount ? round2(nonRepeaterTotal / nonRepeaterCount) : 0,
    repeatersCount: repeaterCount,
    nonRepeatersCount: nonRepeaterCount,
  };
}

function aggregateCauseCounts(causes) {
  const counts = {
    'Absences élevées': 0,
    'Notes faibles': 0,
    Mixte: 0,
    Autre: 0,
  };
  causes.forEach((c) => {
    if (counts[c.cause] !== undefined) counts[c.cause] += 1;
    else counts[c.cause] = 1;
  });
  return counts;
}

function aggregateGenderByCause(causes) {
  const map = {};
  causes.forEach((c) => {
    if (!map[c.cause]) map[c.cause] = { M: 0, F: 0, other: 0 };
    if (c.gender === 'M') map[c.cause].M += 1;
    else if (c.gender === 'F') map[c.cause].F += 1;
    else map[c.cause].other += 1;
  });
  return map;
}

async function getHistoricalCauseStats(schoolId) {
  const years = await prisma.studentYearRecord.findMany({
    where: { schoolId, repeatYear: true },
    select: { schoolYear: true },
    distinct: ['schoolYear'],
    orderBy: { schoolYear: 'asc' },
  });

  const historical = [];
  for (const { schoolYear } of years) {
    const causes = await analyzeRedoublementCauses(schoolYear, schoolId);
    if (!causes.length) continue;
    historical.push({
      schoolYear,
      total: causes.length,
      ...aggregateCauseCounts(causes),
    });
  }
  return historical;
}

async function getRedoublementCauseStats(schoolId, schoolYear) {
  try {
    const [causes, absencesComparison, historicalCauses] = await Promise.all([
      analyzeRedoublementCauses(schoolYear, schoolId),
      compareRepeaterAbsences(schoolId, schoolYear),
      getHistoricalCauseStats(schoolId),
    ]);

    return {
      ok: true,
      causes,
      causeCounts: aggregateCauseCounts(causes),
      absencesComparison,
      genderByCause: aggregateGenderByCause(causes),
      historicalCauses,
      thresholds: { absences: ABSENCE_THRESHOLD, grade: GRADE_THRESHOLD },
    };
  } catch (err) {
    logger.error('getRedoublementCauseStats failed', { error: err.message, schoolId, schoolYear });
    return {
      ok: false,
      error: 'stats',
      causes: [],
      causeCounts: {},
      absencesComparison: { repeatersAvg: 0, nonRepeatersAvg: 0, repeatersCount: 0, nonRepeatersCount: 0 },
      genderByCause: {},
      historicalCauses: [],
      thresholds: { absences: ABSENCE_THRESHOLD, grade: GRADE_THRESHOLD },
    };
  }
}

async function reEnrollStudent(studentId, nextClassId, schoolYear) {
  if (!studentId || !schoolYear) {
    return { ok: false, error: 'data' };
  }

  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: true,
        grades: { select: { value: true, maxValue: true } },
      },
    });
    if (!student?.classId) return { ok: false, error: 'student' };

    const existing = await prisma.studentYearRecord.findUnique({
      where: { studentId_schoolYear: { studentId, schoolYear } },
    });
    if (existing) return { ok: false, error: 'already_enrolled' };

    const validated = studentValidatedYear(student.grades);
    let targetClassId;
    let repeatYear;

    if (validated) {
      if (!nextClassId) return { ok: false, error: 'class' };
      const nextClass = await prisma.class.findFirst({
        where: { id: nextClassId, schoolId: student.schoolId },
      });
      if (!nextClass) return { ok: false, error: 'class' };
      targetClassId = nextClassId;
      repeatYear = false;
    } else {
      targetClassId = student.classId;
      repeatYear = true;
      if (nextClassId && nextClassId !== student.classId) {
        return { ok: false, error: 'repeat_class' };
      }
    }

    const [updatedStudent, record] = await prisma.$transaction([
      prisma.student.update({
        where: { id: studentId },
        data: { classId: targetClassId },
      }),
      prisma.studentYearRecord.create({
        data: {
          studentId,
          schoolYear,
          classId: targetClassId,
          schoolId: student.schoolId || null,
          repeatYear,
          status: 'inscrit',
          gender: student.gender || null,
        },
        include: RECORD_INCLUDE,
      }),
    ]);

    return {
      ok: true,
      record,
      student: updatedStudent,
      promoted: !repeatYear,
      repeated: repeatYear,
      validated,
    };
  } catch (err) {
    logger.error('reEnrollStudent failed', { error: err.message, studentId });
    return { ok: false, error: 'server' };
  }
}

async function getReinscriptionStats(schoolId, schoolYear) {
  const where = {};
  if (schoolId) where.schoolId = schoolId;
  if (schoolYear) where.schoolYear = schoolYear;

  try {
    const records = await prisma.studentYearRecord.findMany({
      where,
      select: {
        repeatYear: true,
        gender: true,
        schoolYear: true,
        classId: true,
        class: { select: { id: true, name: true, level: true } },
      },
    });

    const total = records.length;
    const promoted = records.filter((r) => !r.repeatYear).length;
    const repeated = records.filter((r) => r.repeatYear).length;

    const repeaters = records.filter((r) => r.repeatYear);
    let boys = 0;
    let girls = 0;
    repeaters.forEach((r) => {
      if (r.gender === 'M') boys += 1;
      else if (r.gender === 'F') girls += 1;
    });
    const repeatGenderTotal = boys + girls;

    const byClassMap = {};
    repeaters.forEach((r) => {
      const key = r.classId;
      if (!byClassMap[key]) {
        byClassMap[key] = {
          classId: r.classId,
          className: r.class?.name || '—',
          level: r.class?.level || '',
          count: 0,
        };
      }
      byClassMap[key].count += 1;
    });

    const historicalMap = {};
    const histWhere = schoolId ? { schoolId } : {};
    const allRecords = await prisma.studentYearRecord.findMany({
      where: histWhere,
      select: { schoolYear: true, repeatYear: true },
    });
    allRecords.forEach((r) => {
      if (!historicalMap[r.schoolYear]) {
        historicalMap[r.schoolYear] = { total: 0, repeated: 0 };
      }
      historicalMap[r.schoolYear].total += 1;
      if (r.repeatYear) historicalMap[r.schoolYear].repeated += 1;
    });

    const historicalRepeatRate = Object.entries(historicalMap)
      .map(([year, bucket]) => ({
        schoolYear: year,
        total: bucket.total,
        repeated: bucket.repeated,
        rate: bucket.total ? round2(bucket.repeated / bucket.total) : 0,
      }))
      .sort((a, b) => a.schoolYear.localeCompare(b.schoolYear));

    return {
      ok: true,
      total,
      promoted,
      repeated,
      repeatGender: {
        boys,
        girls,
        total: repeatGenderTotal,
        boysPct: repeatGenderTotal ? round2(boys / repeatGenderTotal) : 0,
        girlsPct: repeatGenderTotal ? round2(girls / repeatGenderTotal) : 0,
      },
      repeatersByClass: Object.values(byClassMap).sort((a, b) => b.count - a.count),
      historicalRepeatRate,
    };
  } catch (err) {
    logger.error('getReinscriptionStats failed', { error: err.message, schoolId });
    return {
      ok: false,
      error: 'stats',
      total: 0,
      promoted: 0,
      repeated: 0,
      repeatGender: { boys: 0, girls: 0, total: 0, boysPct: 0, girlsPct: 0 },
      repeatersByClass: [],
      historicalRepeatRate: [],
    };
  }
}

async function listReinscriptionRows(schoolId, schoolYear) {
  if (!schoolId) return { ok: false, error: 'school', rows: [] };

  try {
    const [students, records, classes] = await Promise.all([
      prisma.student.findMany({
        where: { schoolId },
        include: { class: { select: { id: true, name: true, level: true } } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      prisma.studentYearRecord.findMany({
        where: { schoolId, schoolYear },
        include: RECORD_INCLUDE,
      }),
      prisma.class.findMany({
        where: { schoolId },
        orderBy: [{ level: 'asc' }, { name: 'asc' }],
      }),
    ]);

    const recordByStudent = {};
    records.forEach((r) => {
      recordByStudent[r.studentId] = r;
    });

    const rows = students.map((s) => {
      const record = recordByStudent[s.id] || null;
      return {
        student: s,
        currentClass: s.class,
        record,
        newClass: record?.class || null,
        repeatYear: record ? record.repeatYear : null,
        enrolled: Boolean(record),
      };
    });

    return { ok: true, rows, classes, records };
  } catch (err) {
    logger.error('listReinscriptionRows failed', { error: err.message, schoolId });
    return { ok: false, error: 'list', rows: [], classes: [], records: [] };
  }
}

async function listRecordsForExport(schoolId, schoolYear) {
  const where = { schoolId, schoolYear, status: 'inscrit' };
  return prisma.studentYearRecord.findMany({
    where,
    include: {
      student: { select: { firstName: true, lastName: true, matricule: true } },
      class: { select: { name: true, level: true } },
    },
    orderBy: [{ repeatYear: 'desc' }, { createdAt: 'asc' }],
  });
}

/** Taux de redoublement au-delà duquel une école est considérée à risque. */
const AT_RISK_REPEAT_RATE = 0.2;

async function resolveGroupSchools(groupId) {
  if (!groupId) return { group: null, schools: [] };
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      schools: { select: { id: true, name: true, currentSchoolYear: true } },
      organization: {
        include: { schools: { select: { id: true, name: true, currentSchoolYear: true } } },
      },
    },
  });
  if (!group) return { group: null, schools: [] };
  let schools = group.schools;
  if (!schools.length && group.organization?.schools?.length) {
    schools = group.organization.schools;
  }
  return { group, schools };
}

function summarizeCauseStats(causes) {
  const stats = { absences: 0, notes: 0, mixte: 0, autre: 0 };
  causes.forEach((c) => {
    if (c.cause === 'Absences élevées') stats.absences += 1;
    else if (c.cause === 'Notes faibles') stats.notes += 1;
    else if (c.cause === 'Mixte') stats.mixte += 1;
    else stats.autre += 1;
  });
  return stats;
}

function primaryCauseFromStats(causeStats) {
  const ranked = [
    ['Absences élevées', causeStats.absences],
    ['Notes faibles', causeStats.notes],
    ['Mixte', causeStats.mixte],
    ['Autre', causeStats.autre],
  ].sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : '—';
}

function aggregateGenderSplit(causes) {
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

async function getGroupRedoublementCauses(groupId, schoolYear) {
  if (!groupId || !schoolYear) {
    return { ok: false, error: 'data', schools: [], groupTotals: null };
  }

  try {
    const { group, schools } = await resolveGroupSchools(groupId);
    if (!group) return { ok: false, error: 'group', schools: [], groupTotals: null };

    const emptyTotals = {
      totalRedoublants: 0,
      causeStats: { absences: 0, notes: 0, mixte: 0, autre: 0 },
      atRiskCount: 0,
    };

    if (!schools.length) {
      return {
        ok: true,
        groupId,
        groupName: group.name,
        schoolYear,
        schools: [],
        groupTotals: emptyTotals,
        thresholds: { absences: ABSENCE_THRESHOLD, grade: GRADE_THRESHOLD, atRiskRate: AT_RISK_REPEAT_RATE },
      };
    }

    const schoolRows = await Promise.all(
      schools.map(async (school) => {
        const [causes, reinscriptionStats, yearRecords] = await Promise.all([
          analyzeRedoublementCauses(schoolYear, school.id),
          getReinscriptionStats(school.id, schoolYear),
          prisma.studentYearRecord.findMany({
            where: { schoolId: school.id, schoolYear },
            select: { repeatYear: true },
          }),
        ]);

        const totalRedoublants = causes.length;
        const absencesAvg = totalRedoublants
          ? round2(causes.reduce((sum, c) => sum + c.absences, 0) / totalRedoublants)
          : 0;
        const notesAvg = totalRedoublants
          ? round2(causes.reduce((sum, c) => sum + c.avgGrade, 0) / totalRedoublants)
          : 0;
        const causeStats = summarizeCauseStats(causes);
        const totalRecords = yearRecords.length;
        const repeaters = yearRecords.filter((r) => r.repeatYear).length;
        const repeatRate = totalRecords ? round2(repeaters / totalRecords) : 0;
        const historicalCauses = await getHistoricalCauseStats(school.id);

        return {
          schoolId: school.id,
          schoolName: school.name,
          totalRedoublants,
          absencesAvg,
          notesAvg,
          causeStats,
          primaryCause: primaryCauseFromStats(causeStats),
          genderSplit: aggregateGenderSplit(causes),
          historicalCauses,
          historicalRepeatRate: reinscriptionStats.historicalRepeatRate || [],
          repeatRate,
          totalRecords,
          repeaters,
          atRisk: repeatRate > AT_RISK_REPEAT_RATE,
        };
      }),
    );

    schoolRows.sort((a, b) => b.totalRedoublants - a.totalRedoublants);

    const groupTotals = {
      totalRedoublants: schoolRows.reduce((sum, s) => sum + s.totalRedoublants, 0),
      causeStats: { absences: 0, notes: 0, mixte: 0, autre: 0 },
      atRiskCount: schoolRows.filter((s) => s.atRisk).length,
    };
    schoolRows.forEach((s) => {
      groupTotals.causeStats.absences += s.causeStats.absences;
      groupTotals.causeStats.notes += s.causeStats.notes;
      groupTotals.causeStats.mixte += s.causeStats.mixte;
      groupTotals.causeStats.autre += s.causeStats.autre;
    });

    return {
      ok: true,
      groupId,
      groupName: group.name,
      schoolYear,
      schools: schoolRows,
      groupTotals,
      thresholds: { absences: ABSENCE_THRESHOLD, grade: GRADE_THRESHOLD, atRiskRate: AT_RISK_REPEAT_RATE },
    };
  } catch (err) {
    logger.error('getGroupRedoublementCauses failed', { error: err.message, groupId, schoolYear });
    return {
      ok: false,
      error: 'stats',
      schools: [],
      groupTotals: null,
      thresholds: { absences: ABSENCE_THRESHOLD, grade: GRADE_THRESHOLD, atRiskRate: AT_RISK_REPEAT_RATE },
    };
  }
}

module.exports = {
  reEnrollStudent,
  getReinscriptionStats,
  listReinscriptionRows,
  listRecordsForExport,
  studentValidatedYear,
  genderLabel,
  analyzeRedoublementCauses,
  getRedoublementCauseStats,
  compareRepeaterAbsences,
  determineCause,
  schoolYearDateRange,
  ABSENCE_THRESHOLD,
  GRADE_THRESHOLD,
  AT_RISK_REPEAT_RATE,
  getGroupRedoublementCauses,
  resolveGroupSchools,
  summarizeCauseStats,
  primaryCauseFromStats,
};
