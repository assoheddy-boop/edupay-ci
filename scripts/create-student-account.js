/**
 * Crée un compte élève (STUDENT) lié à un enregistrement Student.
 * Usage: node scripts/create-student-account.js <email> <studentId> [motDePasse]
 */
require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { createStudentUserAccount } = require('../src/utils/studentAccount');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const [email, studentId, password = 'demo1234'] = process.argv.slice(2);
  if (!email || !studentId) {
    console.error('Usage: node scripts/create-student-account.js <email> <studentId> [password]');
    process.exit(1);
  }

  const result = await createStudentUserAccount({
    email,
    password,
    studentId,
  });

  if (!result.ok) {
    const messages = {
      missing: 'Email, mot de passe et studentId requis.',
      student: 'Élève introuvable.',
      linked: 'Cet élève a déjà un compte.',
      email: 'Email déjà utilisé.',
    };
    console.error(messages[result.error] || result.error);
    process.exit(1);
  }

  const { user, student } = result;
  const school = student.class?.school?.name || student.schoolId || '—';
  console.log('OK —', user.email, '→', student.firstName, student.lastName, `(${school})`);
  console.log('Connexion : /student/dashboard');
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
