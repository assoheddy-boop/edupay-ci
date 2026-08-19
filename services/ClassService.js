const prisma = require('../src/config/database');
const logger = require('./logger');
const { PASSING_RATIO } = require('./StatsService');
const { computeAverage } = require('../src/services/gradesAverage');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function parseGender(value) {
  if (value == null || String(value).trim() === '') return null;
  const g = String(value).trim().toUpperCase();
  if (g === 'M' || g === 'F') return g;
  return null;
}

function assertGender(value) {
  if (value == null || String(value).trim() === '') return { ok: true, gender: null };
  const g = String(value).trim().toUpperCase();
  if (g === 'M' || g === 'F') return { ok: true, gender: g };
  return { ok: false, error: 'gender' };
}

function genderBucket(gender) {
  if (gender === 'M') return 'boys';
  if (gender === 'F') return 'girls';
  return null;
}

function emptySuccess() {
  return { count: 0, passing: 0, successRate: 0, averageOn20: 0 };
}

function finishSuccess(bucket) {
  return {
    count: bucket.total,
    passing: bucket.passing,
    successRate: bucket.total ? round2(bucket.passing / bucket.total) : 0,
    averageOn20: bucket.total ? round2((bucket.ratioSum / bucket.total) * 20) : 0,
  };
}

function computeGenderStats(students) {
  // total = all students in the class (including unknown gender); boys/girls count only M/F
  let boys = 0;
  let girls = 0;
  const absences = { boys: 0, girls: 0 };
  const gradeBoys = { total: 0, passing: 0, ratioSum: 0 };
  const gradeGirls = { total: 0, passing: 0, ratioSum: 0 };
  const avgBoys = { sum: 0, n: 0 };
  const avgGirls = { sum: 0, n: 0 };

  students.forEach((s) => {
    if (s.gender === 'M') boys += 1;
    else if (s.gender === 'F') girls += 1;

    const absCount = Array.isArray(s.absences) ? s.absences.length : 0;
    const bucket = genderBucket(s.gender);
    if (bucket) absences[bucket] += absCount;

    (s.grades || []).forEach((g) => {
      const max = Number(g.maxValue) || 0;
      if (!max) return;
      const r = Number(g.value) / max;
      const target = s.gender === 'M' ? gradeBoys : s.gender === 'F' ? gradeGirls : null;
      if (!target) return;
      target.total += 1;
      target.ratioSum += r;
      if (r >= PASSING_RATIO) target.passing += 1;
    });

    if ((s.grades || []).length && (s.gender === 'M' || s.gender === 'F')) {
      const avg = computeAverage(s.grades);
      if (s.gender === 'M') {
        avgBoys.sum += avg;
        avgBoys.n += 1;
      } else {
        avgGirls.sum += avg;
        avgGirls.n += 1;
      }
    }
  });

  const boysSuccess = finishSuccess(gradeBoys);
  const girlsSuccess = finishSuccess(gradeGirls);
  boysSuccess.averageOn20 = avgBoys.n ? round2(avgBoys.sum / avgBoys.n) : 0;
  girlsSuccess.averageOn20 = avgGirls.n ? round2(avgGirls.sum / avgGirls.n) : 0;

  return {
    boys,
    girls,
    total: students.length,
    unknown: students.length - boys - girls,
    absences,
    success: {
      boys: boysSuccess,
      girls: girlsSuccess,
    },
  };
}

const studentGenderSelect = {
  id: true,
  gender: true,
  absences: { select: { id: true } },
  grades: { select: { value: true, maxValue: true, subject: true } },
};

async function getClassGenderStats(classId) {
  if (!classId) {
    return {
      ok: false,
      error: 'class',
      boys: 0,
      girls: 0,
      total: 0,
      unknown: 0,
      absences: { boys: 0, girls: 0 },
      success: { boys: emptySuccess(), girls: emptySuccess() },
    };
  }

  try {
    const students = await prisma.student.findMany({
      where: { classId },
      select: studentGenderSelect,
    });
    return { ok: true, ...computeGenderStats(students) };
  } catch (err) {
    logger.error('getClassGenderStats failed', { error: err.message });
    return {
      ok: false,
      error: 'stats',
      boys: 0,
      girls: 0,
      total: 0,
      unknown: 0,
      absences: { boys: 0, girls: 0 },
      success: { boys: emptySuccess(), girls: emptySuccess() },
    };
  }
}

async function getGenderStatsBySchool(schoolId) {
  try {
    const students = await prisma.student.findMany({
      where: schoolId ? { schoolId } : { schoolId: { not: null } },
      select: {
        gender: true,
        schoolId: true,
        school: { select: { id: true, name: true } },
        absences: { select: { id: true } },
        grades: { select: { value: true, maxValue: true, subject: true } },
      },
    });

    const bySchool = {};
    students.forEach((s) => {
      const id = s.schoolId || s.school?.id || 'unknown';
      if (!bySchool[id]) {
        bySchool[id] = {
          schoolId: id,
          schoolName: s.school?.name || '—',
          students: [],
        };
      }
      bySchool[id].students.push(s);
    });

    return {
      ok: true,
      schools: Object.values(bySchool).map((row) => ({
        schoolId: row.schoolId,
        schoolName: row.schoolName,
        ...computeGenderStats(row.students),
      })),
    };
  } catch (err) {
    logger.error('getGenderStatsBySchool failed', { error: err.message });
    return { ok: false, error: 'stats', schools: [] };
  }
}

async function listClassGenderStats({ schoolId } = {}) {
  try {
    const [classes, students] = await Promise.all([
      prisma.class.findMany({
        where: schoolId ? { schoolId } : {},
        select: {
          id: true,
          name: true,
          level: true,
          schoolId: true,
          school: { select: { id: true, name: true } },
        },
        orderBy: [{ name: 'asc' }],
      }),
      prisma.student.findMany({
        where: schoolId ? { schoolId } : {},
        select: {
          classId: true,
          gender: true,
          absences: { select: { id: true } },
          grades: { select: { value: true, maxValue: true, subject: true } },
        },
      }),
    ]);

    const byClass = {};
    students.forEach((s) => {
      if (!byClass[s.classId]) byClass[s.classId] = [];
      byClass[s.classId].push(s);
    });

    return {
      ok: true,
      classes: classes.map((c) => ({
        classId: c.id,
        className: c.name,
        level: c.level,
        schoolId: c.schoolId,
        schoolName: c.school?.name || '—',
        ...computeGenderStats(byClass[c.id] || []),
      })),
    };
  } catch (err) {
    logger.error('listClassGenderStats failed', { error: err.message });
    return { ok: false, error: 'stats', classes: [] };
  }
}

module.exports = {
  getClassGenderStats,
  getGenderStatsBySchool,
  listClassGenderStats,
  parseGender,
  assertGender,
  computeGenderStats,
};
