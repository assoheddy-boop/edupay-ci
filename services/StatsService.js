const prisma = require('../src/config/database');
const logger = require('./logger');
const { computeAverage, loadSchoolCoefficients } = require('../src/services/gradesAverage');
const { filterGradesForBulletin } = require('../src/services/academicTerms');

const PASSING_RATIO = 0.5;

function dateRange(from, to, endOfDay = true) {
  const start = from ? new Date(from) : null;
  const end = to ? new Date(to) : null;
  if (end && !Number.isNaN(end.getTime()) && endOfDay) end.setHours(23, 59, 59, 999);
  const where = {};
  if (start && !Number.isNaN(start.getTime())) where.gte = start;
  if (end && !Number.isNaN(end.getTime())) where.lte = end;
  return Object.keys(where).length ? where : undefined;
}

function studentFilter(schoolId, classId) {
  const student = {};
  if (schoolId) student.schoolId = schoolId;
  if (classId) student.classId = classId;
  return Object.keys(student).length ? student : undefined;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function ratio(value, maxValue) {
  const max = Number(maxValue);
  if (!max) return 0;
  return Number(value) / max;
}

function studentLabel(student) {
  if (!student) return '';
  return `${student.lastName || ''} ${student.firstName || ''}`.trim();
}

function bump(map, key, seed) {
  if (!map[key]) map[key] = seed();
  return map[key];
}

async function getAbsenceStats({ schoolId, classId, from, to } = {}) {
  try {
    const student = studentFilter(schoolId, classId);
    const date = dateRange(from, to);
    const where = {
      ...(student ? { student } : {}),
      ...(date ? { date } : {}),
    };

    const absences = await prisma.absence.findMany({
      where,
      include: {
        student: {
          include: {
            class: { select: { id: true, name: true, level: true } },
            school: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    const byType = {};
    const byClassMap = {};
    const rows = absences.map((a) => {
      byType[a.type] = (byType[a.type] || 0) + 1;
      const cid = a.student?.classId || a.student?.class?.id || 'unknown';
      const bucket = bump(byClassMap, cid, () => ({
        classId: cid,
        className: a.student?.class?.name || '—',
        schoolId: a.student?.schoolId || a.student?.school?.id || null,
        schoolName: a.student?.school?.name || '—',
        absences: 0,
        lates: 0,
        total: 0,
      }));
      bucket.total += 1;
      if (a.type === 'LATE') bucket.lates += 1;
      else bucket.absences += 1;

      return {
        id: a.id,
        date: a.date,
        type: a.type,
        reason: a.reason || '',
        studentId: a.studentId,
        studentName: studentLabel(a.student),
        classId: a.student?.classId || null,
        className: a.student?.class?.name || '',
        schoolId: a.student?.schoolId || null,
        schoolName: a.student?.school?.name || '',
      };
    });

    return {
      ok: true,
      total: absences.length,
      byType,
      byClass: Object.values(byClassMap),
      rows,
    };
  } catch (err) {
    logger.error('getAbsenceStats failed', { error: err.message });
    return { ok: false, error: 'stats' };
  }
}

async function getSuccessRate({ schoolId, classId, subject, period } = {}) {
  try {
    const student = studentFilter(schoolId, classId);
    const where = {
      ...(student ? { student } : {}),
      ...(subject ? { subject } : {}),
    };

    const gradesRaw = await prisma.grade.findMany({
      where,
      include: {
        student: {
          include: {
            class: { select: { id: true, name: true, level: true } },
            school: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const grades = period ? filterGradesForBulletin(gradesRaw, period) : gradesRaw;
    const coeffMap = await loadSchoolCoefficients(schoolId);

    const byClassMap = {};
    const bySubjectMap = {};
    let ratioSum = 0;
    let passing = 0;

    const rows = grades.map((g) => {
      const r = ratio(g.value, g.maxValue);
      ratioSum += r;
      const passed = r >= PASSING_RATIO;
      if (passed) passing += 1;

      const cid = g.student?.classId || g.student?.class?.id || 'unknown';
      const classBucket = bump(byClassMap, cid, () => ({
        classId: cid,
        className: g.student?.class?.name || '—',
        schoolId: g.student?.schoolId || g.student?.school?.id || null,
        schoolName: g.student?.school?.name || '—',
        count: 0,
        ratioSum: 0,
        passing: 0,
      }));
      classBucket.count += 1;
      classBucket.ratioSum += r;
      if (passed) classBucket.passing += 1;

      const subj = g.subject || '—';
      const subjectBucket = bump(bySubjectMap, subj, () => ({
        subject: subj,
        count: 0,
        ratioSum: 0,
        passing: 0,
      }));
      subjectBucket.count += 1;
      subjectBucket.ratioSum += r;
      if (passed) subjectBucket.passing += 1;

      return {
        id: g.id,
        subject: g.subject,
        period: g.period,
        value: g.value,
        maxValue: g.maxValue,
        ratio: round2(r),
        on20: round2(r * 20),
        passed,
        studentId: g.studentId,
        studentName: studentLabel(g.student),
        classId: g.student?.classId || null,
        className: g.student?.class?.name || '',
        schoolId: g.student?.schoolId || null,
        schoolName: g.student?.school?.name || '',
      };
    });

    const finish = (bucket) => ({
      ...bucket,
      averageRatio: bucket.count ? round2(bucket.ratioSum / bucket.count) : 0,
      averageOn20: bucket.count ? round2((bucket.ratioSum / bucket.count) * 20) : 0,
      successRate: bucket.count ? round2(bucket.passing / bucket.count) : 0,
    });

    const total = grades.length;
    const averageRatio = total ? ratioSum / total : 0;

    return {
      ok: true,
      total,
      passing,
      averageRatio: round2(averageRatio),
      averageOn20: computeAverage(grades, coeffMap),
      successRate: total ? round2(passing / total) : 0,
      byClass: Object.values(byClassMap).map((bucket) => {
        const classGrades = grades.filter((g) => (g.student?.classId || g.student?.class?.id || 'unknown') === bucket.classId);
        return {
          ...finish(bucket),
          averageOn20: classGrades.length ? computeAverage(classGrades, coeffMap) : 0,
        };
      }),
      bySubject: Object.values(bySubjectMap).map(finish),
      rows,
    };
  } catch (err) {
    logger.error('getSuccessRate failed', { error: err.message });
    return { ok: false, error: 'stats' };
  }
}

function getGenderCounter() {
  const { computeGenderStats } = require('./ClassService');
  return computeGenderStats;
}

function genderTotals(students) {
  const { boys, girls, total } = getGenderCounter()(students);
  return { boys, girls, total };
}

async function getClassGenderStats(classId) {
  if (!classId) return { boys: 0, girls: 0, total: 0 };
  try {
    const { getClassGenderStats: classGenderStats } = require('./ClassService');
    const result = await classGenderStats(classId);
    if (!result.ok) return { boys: 0, girls: 0, total: 0 };
    return { boys: result.boys, girls: result.girls, total: result.total };
  } catch (err) {
    logger.error('getClassGenderStats failed', { error: err.message });
    return { boys: 0, girls: 0, total: 0 };
  }
}

async function getSchoolGenderStats(schoolId) {
  if (!schoolId) return { boys: 0, girls: 0, total: 0 };
  try {
    const students = await prisma.student.findMany({
      where: { schoolId },
      select: { gender: true },
    });
    return genderTotals(students);
  } catch (err) {
    logger.error('getSchoolGenderStats failed', { error: err.message });
    return { boys: 0, girls: 0, total: 0 };
  }
}

async function resolveGroupSchoolIds(groupId) {
  if (!groupId) return [];
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      schools: { select: { id: true } },
      organization: {
        include: { schools: { select: { id: true } } },
      },
    },
  });
  if (!group) return [];
  let schoolIds = group.schools.map((s) => s.id);
  if (!schoolIds.length && group.organization?.schools?.length) {
    schoolIds = group.organization.schools.map((s) => s.id);
  }
  return schoolIds;
}

async function getGroupGenderStats(groupId) {
  if (!groupId) return { boys: 0, girls: 0, total: 0 };
  try {
    const schoolIds = await resolveGroupSchoolIds(groupId);
    if (!schoolIds.length) return { boys: 0, girls: 0, total: 0 };

    const students = await prisma.student.findMany({
      where: { schoolId: { in: schoolIds } },
      select: { gender: true },
    });
    return genderTotals(students);
  } catch (err) {
    logger.error('getGroupGenderStats failed', { error: err.message });
    return { boys: 0, girls: 0, total: 0 };
  }
}

const genderMetricsSelect = {
  gender: true,
  absences: { select: { id: true } },
  grades: { select: { value: true, maxValue: true, subject: true, kind: true } },
};

async function fetchStudentsForGenderMetrics({ classId, schoolId, groupId } = {}) {
  if (classId) {
    return prisma.student.findMany({ where: { classId }, select: genderMetricsSelect });
  }
  if (schoolId) {
    return prisma.student.findMany({ where: { schoolId }, select: genderMetricsSelect });
  }
  if (groupId) {
    const schoolIds = await resolveGroupSchoolIds(groupId);
    if (!schoolIds.length) return [];
    return prisma.student.findMany({
      where: { schoolId: { in: schoolIds } },
      select: genderMetricsSelect,
    });
  }
  return [];
}

async function getAbsenceStatsByGender({ classId, schoolId, groupId } = {}) {
  const empty = { ok: true, boys: 0, girls: 0, total: 0 };
  if (!classId && !schoolId && !groupId) return empty;
  try {
    const { computeGenderStats } = require('./ClassService');
    const students = await fetchStudentsForGenderMetrics({ classId, schoolId, groupId });
    const stats = computeGenderStats(students);
    const boys = stats.absences.boys;
    const girls = stats.absences.girls;
    return { ok: true, boys, girls, total: boys + girls };
  } catch (err) {
    logger.error('getAbsenceStatsByGender failed', { error: err.message });
    return { ok: false, error: 'stats', boys: 0, girls: 0, total: 0 };
  }
}

async function getSuccessRateByGender({ classId, schoolId, groupId } = {}) {
  const emptySuccess = () => ({ count: 0, passing: 0, successRate: 0, averageOn20: 0 });
  const empty = { ok: true, boys: emptySuccess(), girls: emptySuccess() };
  if (!classId && !schoolId && !groupId) return empty;
  try {
    const { computeGenderStats } = require('./ClassService');
    const students = await fetchStudentsForGenderMetrics({ classId, schoolId, groupId });
    const stats = computeGenderStats(students);
    return { ok: true, boys: stats.success.boys, girls: stats.success.girls };
  } catch (err) {
    logger.error('getSuccessRateByGender failed', { error: err.message });
    return { ok: false, error: 'stats', boys: emptySuccess(), girls: emptySuccess() };
  }
}

async function getHealthStats({ schoolId, classId, from, to } = {}) {
  try {
    const student = studentFilter(schoolId, classId);
    const createdAt = dateRange(from, to);
    const where = {
      ...(student ? { student } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const incidents = await prisma.healthIncident.findMany({
      where,
      include: {
        student: {
          include: {
            class: { select: { id: true, name: true, level: true } },
            school: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const byType = {};
    const byClassMap = {};
    const rows = incidents.map((h) => {
      const type = h.type || 'AUTRE';
      byType[type] = (byType[type] || 0) + 1;
      const cid = h.student?.classId || h.student?.class?.id || 'unknown';
      const bucket = bump(byClassMap, cid, () => ({
        classId: cid,
        className: h.student?.class?.name || '—',
        schoolId: h.student?.schoolId || h.student?.school?.id || null,
        schoolName: h.student?.school?.name || '—',
        total: 0,
        byType: {},
      }));
      bucket.total += 1;
      bucket.byType[type] = (bucket.byType[type] || 0) + 1;

      return {
        id: h.id,
        type,
        description: h.description || '',
        createdAt: h.createdAt,
        studentId: h.studentId,
        studentName: studentLabel(h.student),
        classId: h.student?.classId || null,
        className: h.student?.class?.name || '',
        schoolId: h.student?.schoolId || null,
        schoolName: h.student?.school?.name || '',
      };
    });

    return {
      ok: true,
      total: incidents.length,
      byType,
      byClass: Object.values(byClassMap),
      rows,
    };
  } catch (err) {
    logger.error('getHealthStats failed', { error: err.message });
    return { ok: false, error: 'stats' };
  }
}

module.exports = {
  getAbsenceStats,
  getSuccessRate,
  getHealthStats,
  getClassGenderStats,
  getSchoolGenderStats,
  getGroupGenderStats,
  getAbsenceStatsByGender,
  getSuccessRateByGender,
  PASSING_RATIO,
};
