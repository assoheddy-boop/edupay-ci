/**
 * Backfill slug and schoolId after schema update — node scripts/backfill-schema.js
 */
require('dotenv/config');
const prisma = require('../src/config/database');
const { generateUniqueSchoolSlug } = require('../src/utils/schoolCode');

async function main() {
  const schools = await prisma.school.findMany();
  for (const school of schools) {
    if (!school.slug) {
      const slug = await generateUniqueSchoolSlug(school.name);
      await prisma.school.update({ where: { id: school.id }, data: { slug } });
      console.log('School slug:', school.name, '→', slug);
    }
  }

  const students = await prisma.student.findMany({
    include: { class: true },
  });
  for (const student of students) {
    if (!student.schoolId && student.class?.schoolId) {
      await prisma.student.update({
        where: { id: student.id },
        data: { schoolId: student.class.schoolId },
      });
    }
  }
  console.log(`Backfilled ${students.length} student(s)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
