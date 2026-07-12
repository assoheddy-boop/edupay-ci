const prisma = require('../config/database');
const { generateBulletinPdf, computeAverage } = require('./bulletinPdf');

async function generateBulletinForStudent({ studentId, period, school }) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: school.id },
    include: { class: true },
  });
  if (!student) return { error: 'eleve' };

  const grades = await prisma.grade.findMany({
    where: { studentId, period },
    orderBy: { subject: 'asc' },
  });
  if (!grades.length) return { error: 'notes' };

  const average = computeAverage(grades);
  const classmates = await prisma.student.findMany({
    where: { classId: student.classId },
    select: { id: true },
  });

  const classAverages = await Promise.all(
    classmates.map(async (c) => {
      const gs = await prisma.grade.findMany({ where: { studentId: c.id, period } });
      return { id: c.id, avg: gs.length ? computeAverage(gs) : 0 };
    }),
  );
  classAverages.sort((a, b) => b.avg - a.avg);
  const rank = classAverages.findIndex((c) => c.id === studentId) + 1;

  const { pdfUrl } = await generateBulletinPdf({
    student,
    school,
    grades,
    period,
    average,
    rank,
    classSize: classmates.length,
  });

  await prisma.bulletin.create({
    data: { studentId, period, pdfUrl, average, rank },
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
        body: `Le bulletin de ${student.firstName} (${period}) est disponible.`,
      },
    });
  }

  return { success: true, student, average, rank };
}

async function generateBulkBulletins({ classId, period, schoolId, school }) {
  const students = await prisma.student.findMany({
    where: { classId, schoolId },
    select: { id: true, firstName: true, lastName: true },
  });

  const results = { generated: 0, skipped: 0, errors: [] };

  for (const student of students) {
    const grades = await prisma.grade.findMany({
      where: { studentId: student.id, period },
    });
    if (!grades.length) {
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
