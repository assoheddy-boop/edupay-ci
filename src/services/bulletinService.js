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

const BULLETIN_TTL = 60 * 60;

async function generateBulletinForStudent({ studentId, period, school }) {
  const term = normalizeTerm(period);
  const cacheKey = `bulletin:${studentId}:${term}:${String(period || '').trim()}`;
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
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: school.id },
    include: { class: true },
  });
  if (!student) return { error: 'eleve' };

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
    select: { id: true },
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
      return { id: c.id, avg };
    }),
  );
  classAverages.sort((a, b) => b.avg - a.avg);
  const rank = classAverages.findIndex((c) => c.id === studentId) + 1;

  const periodLabel = formatTermLabel(period);
  const { pdfUrl } = await generateBulletinPdf({
    student,
    school,
    grades: term === 'ANNUELLE' ? filterGradesForBulletin(allGrades, 'ANNUELLE') : grades,
    period: periodLabel,
    average,
    rank,
    classSize: classmates.length,
    coeffMap,
    termAverages: term === 'ANNUELLE' ? termAverages : null,
  });

  await prisma.bulletin.create({
    data: { studentId, period: term === 'AUTRE' ? periodLabel : term, pdfUrl, average, rank },
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
    rank,
    student: { id: student.id, firstName: student.firstName, lastName: student.lastName },
  };
  await setCache(cacheKey, payload, BULLETIN_TTL);

  return { success: true, student, average, rank, pdfUrl };
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

module.exports = { generateBulletinForStudent, generateBulkBulletins };
