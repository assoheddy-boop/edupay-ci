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

async function generateBulletinForStudent({ studentId, period, school }) {
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

  const cacheKey = `bulletin:${studentId}:${term}:${String(period || '').trim()}:${mention || ''}:${decision || ''}:${savedDelib?.updatedAt || ''}`;
  const cached = await getCache(cacheKey);
  if (cached?.pdfUrl) {
    return {
      success: true,
      cached: true,
      student: cached.student,
      average: cached.average,
      rank: cached.rank,
      pdfUrl: cached.pdfUrl,
    };
  }

  const allGrades = await prisma.grade.findMany({
    where: { studentId },
    orderBy: { subject: 'asc' },
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

  const periodLabel = formatTermLabel(period);
  const series = effectiveSeries(student, student.class);
  const { pdfUrl } = await generateBulletinPdf({
    student,
    school,
    grades: term === 'ANNUELLE' ? filterGradesForBulletin(allGrades, 'ANNUELLE') : grades,
    period: periodLabel,
    average,
    rank: classement.rank,
    classSize: classement.classSize,
    genderRank: classement.genderRank,
    genderSize: classement.genderSize,
    genderGroup: classement.genderGroup,
    coeffMap,
    termAverages: term === 'ANNUELLE' ? termAverages : null,
    mention,
    decision,
    series,
  });

  await prisma.bulletin.create({
    data: { studentId, period: term === 'AUTRE' ? periodLabel : term, pdfUrl, average, rank: classement.rank },
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
    pdfUrl,
    average,
    rank: classement.rank,
    student: { id: student.id, firstName: student.firstName, lastName: student.lastName },
  };
  await setCache(cacheKey, payload, BULLETIN_TTL);

  return { success: true, student, average, rank: classement.rank, pdfUrl, mention, decision };
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

module.exports = { generateBulletinForStudent, generateBulkBulletins, findSavedDeliberation };
