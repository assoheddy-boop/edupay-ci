const prisma = require('../config/database');
const { generateBulletinPdf } = require('./bulletinPdf');
const {
  computeAverage,
  computeAnnuelleAverage,
  computeTermAverages,
  loadSchoolCoefficients,
} = require('./gradesAverage');
const { normalizeTerm, formatTermLabel, filterGradesForBulletin } = require('./academicTerms');
const { getCache, setCache } = require('../../services/cache');
const { computeClassement } = require('./classement');
const { effectiveSeries } = require('./series');
const { schoolBulletinDownloadUrl } = require('../utils/bulletinLinks');
const { computeSubjectRows } = require('./gradesAverage');
const { computeClassStats } = require('../utils/bulletinCiLayout');

const gradeTeacherInclude = {
  teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
};

async function computeSubjectRanks({ classmates, period, coeffMap, studentId }) {
  const bySubject = new Map();

  await Promise.all(
    classmates.map(async (c) => {
      const gs = await prisma.grade.findMany({
        where: { studentId: c.id },
        select: { subject: true, value: true, maxValue: true, period: true, term: true, kind: true },
      });
      const filtered = filterGradesForBulletin(gs, period);
      const rows = computeSubjectRows(filtered, coeffMap);
      rows.forEach((row) => {
        if (!bySubject.has(row.subject)) bySubject.set(row.subject, []);
        bySubject.get(row.subject).push({ studentId: c.id, average: row.average });
      });
    }),
  );

  const ranks = {};
  for (const [subject, entries] of bySubject) {
    const sorted = [...entries].sort((a, b) => b.average - a.average);
    const idx = sorted.findIndex((e) => e.studentId === studentId);
    ranks[subject] = idx >= 0 ? idx + 1 : null;
  }
  return ranks;
}

const BULLETIN_TTL = 60 * 60;

async function findSavedDeliberation({ studentId, classId, term, schoolYear, schoolId }) {
  if (!['T1', 'T2', 'T3'].includes(term)) return null;
  const year = String(schoolYear || '').trim();
  if (!studentId || !classId || !year) return null;
  return prisma.deliberation.findFirst({
    where: {
      studentId,
      classId,
      term,
      schoolYear: year,
      ...(schoolId ? { schoolId } : {}),
    },
  });
}

async function buildBulletinPdfPayload({ studentId, period, school }) {
  const term = normalizeTerm(period);
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: school.id },
    include: { class: true },
  });
  if (!student) return { error: 'eleve' };

  const schoolYear = student.class?.schoolYear || school.currentSchoolYear || '2025-2026';
  const savedDelib = await findSavedDeliberation({
    studentId,
    classId: student.classId,
    term,
    schoolYear,
    schoolId: school.id,
  });
  const mention = savedDelib?.mention || null;
  const decision = savedDelib?.decision || null;

  const allGrades = await prisma.grade.findMany({
    where: { studentId },
    orderBy: { subject: 'asc' },
    include: gradeTeacherInclude,
  });
  const grades = filterGradesForBulletin(allGrades, period);
  if (!grades.length) return { error: 'notes' };

  const coeffMap = await loadSchoolCoefficients(school.id);
  const termAverages = computeTermAverages(allGrades, coeffMap);
  const average = term === 'ANNUELLE'
    ? computeAnnuelleAverage(allGrades, coeffMap)
    : computeAverage(grades, coeffMap);

  const classmates = await prisma.student.findMany({
    where: { classId: student.classId },
    select: { id: true, gender: true, series: true },
  });

  const classAverages = await Promise.all(
    classmates.map(async (c) => {
      const gs = await prisma.grade.findMany({ where: { studentId: c.id } });
      const filtered = filterGradesForBulletin(gs, period);
      let avg = 0;
      if (term === 'ANNUELLE') {
        avg = filterGradesForBulletin(gs, 'ANNUELLE').length
          ? computeAnnuelleAverage(gs, coeffMap)
          : 0;
      } else if (filtered.length) {
        avg = computeAverage(filtered, coeffMap);
      }
      return { id: c.id, avg, gender: c.gender };
    }),
  );
  const classement = computeClassement(classAverages, studentId);
  const classStats = computeClassStats(classAverages);
  const subjectRanks = await computeSubjectRanks({
    classmates,
    period,
    coeffMap,
    studentId,
  });

  const yearRecord = await prisma.studentYearRecord.findFirst({
    where: {
      studentId,
      schoolYear,
      classId: student.classId,
    },
    select: { repeatYear: true },
  });

  const periodLabel = formatTermLabel(period);
  const storedPeriod = term === 'AUTRE' ? periodLabel : term;
  const series = effectiveSeries(student, student.class);
  const annualAverage = term === 'ANNUELLE'
    ? average
    : computeAnnuelleAverage(allGrades, coeffMap);

  return {
    term,
    student,
    mention,
    decision,
    savedDelib,
    grades,
    allGrades,
    coeffMap,
    termAverages,
    average,
    annualAverage,
    classement,
    classStats,
    subjectRanks,
    repeatYear: yearRecord?.repeatYear ?? null,
    periodLabel,
    storedPeriod,
    series,
  };
}

function bulletinPdfArgs(built, school) {
  const {
    term,
    student,
    mention,
    decision,
    grades,
    allGrades,
    coeffMap,
    termAverages,
    average,
    annualAverage,
    classement,
    classStats,
    subjectRanks,
    repeatYear,
    periodLabel,
  } = built;

  const showBilan = term === 'T3' || term === 'ANNUELLE';

  return {
    student,
    school,
    grades: term === 'ANNUELLE' ? filterGradesForBulletin(allGrades, 'ANNUELLE') : grades,
    period: periodLabel,
    average,
    rank: classement.rank,
    classSize: classement.classSize,
    coeffMap,
    termAverages: showBilan ? termAverages : null,
    mention,
    decision,
    subjectRanks,
    classStats,
    repeatYear,
    annualAverage,
  };
}

async function streamBulletinPdf({ studentId, period, school }) {
  const built = await buildBulletinPdfPayload({ studentId, period, school });
  if (built.error) return built;

  const pdf = await generateBulletinPdf(bulletinPdfArgs(built, school));

  return { ok: true, ...pdf, average: built.average, rank: built.classement.rank };
}

async function generateBulletinForStudent({ studentId, period, school }) {
  const built = await buildBulletinPdfPayload({ studentId, period, school });
  if (built.error) return built;

  const {
    term,
    student,
    mention,
    decision,
    savedDelib,
    storedPeriod,
    average,
    classement,
    periodLabel,
  } = built;

  const cacheKey = `bulletin:${studentId}:${term}:${String(period || '').trim()}:${mention || ''}:${decision || ''}:${savedDelib?.updatedAt || ''}`;
  const cached = await getCache(cacheKey);
  const downloadUrl = schoolBulletinDownloadUrl(studentId, storedPeriod);
  if (cached?.pdfUrl) {
    return {
      success: true,
      cached: true,
      student: cached.student,
      average: cached.average,
      rank: cached.rank,
      pdfUrl: cached.pdfUrl.startsWith('/uploads/bulletins/')
        ? downloadUrl
        : cached.pdfUrl,
    };
  }

  await generateBulletinPdf(bulletinPdfArgs(built, school));

  await prisma.bulletin.create({
    data: {
      studentId,
      period: storedPeriod,
      pdfUrl: downloadUrl,
      average,
      rank: classement.rank,
    },
  });

  const parents = await prisma.parentStudent.findMany({
    where: { studentId },
    include: { parent: true },
  });

  for (const link of parents) {
    await prisma.notification.create({
      data: {
        userId: link.parent.userId,
        type: 'GENERAL',
        title: 'Bulletin disponible',
        body: `Le bulletin de ${student.firstName} (${periodLabel}) est disponible.`,
      },
    });
  }

  const payload = {
    pdfUrl: downloadUrl,
    average,
    rank: classement.rank,
    student: { id: student.id, firstName: student.firstName, lastName: student.lastName },
  };
  await setCache(cacheKey, payload, BULLETIN_TTL);

  return {
    success: true,
    student,
    average,
    rank: classement.rank,
    pdfUrl: downloadUrl,
    mention,
    decision,
  };
}

async function generateBulkBulletins({ classId, period, schoolId, school }) {
  const students = await prisma.student.findMany({
    where: { classId, schoolId },
    select: { id: true, firstName: true, lastName: true },
  });

  const results = { generated: 0, skipped: 0, errors: [] };

  for (const student of students) {
    const grades = await prisma.grade.findMany({
      where: { studentId: student.id },
    });
    const filtered = filterGradesForBulletin(grades, period);
    if (!filtered.length) {
      results.skipped += 1;
      results.errors.push({ student: `${student.firstName} ${student.lastName}`, reason: 'Aucune note' });
      continue;
    }

    try {
      const out = await generateBulletinForStudent({ studentId: student.id, period, school });
      if (out.error) {
        results.skipped += 1;
        results.errors.push({ student: `${student.firstName} ${student.lastName}`, reason: out.error });
      } else {
        results.generated += 1;
      }
    } catch (err) {
      results.skipped += 1;
      results.errors.push({ student: `${student.firstName} ${student.lastName}`, reason: err.message });
    }
  }

  return results;
}

module.exports = {
  generateBulletinForStudent,
  generateBulkBulletins,
  findSavedDeliberation,
  streamBulletinPdf,
};
