/**
 * Attribue un rôle staff à un compte SCHOOL_ADMIN existant.
 * Usage: node scripts/assign-staff-role.js <email> <schoolId> <SECRETARIAT|ACCOUNTANT|EDUCATOR|LIFE_SCHOOL>
 */
require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const VALID = ['SECRETARIAT', 'ACCOUNTANT', 'EDUCATOR', 'LIFE_SCHOOL'];

async function main() {
  const [email, schoolId, staffRole] = process.argv.slice(2);
  if (!email || !schoolId || !VALID.includes(staffRole)) {
    console.error('Usage: node scripts/assign-staff-role.js <email> <schoolId> <role>');
    console.error('Roles:', VALID.join(', '));
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.error('Utilisateur introuvable:', email);
    process.exit(1);
  }
  if (user.role !== 'SCHOOL_ADMIN') {
    console.error('Le compte doit avoir le rôle SCHOOL_ADMIN (connexion inchangée).');
    process.exit(1);
  }

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) {
    console.error('École introuvable:', schoolId);
    process.exit(1);
  }
  if (school.adminId === user.id) {
    console.error('Le directeur titulaire a déjà tous les accès (DIRECTOR implicite).');
    process.exit(1);
  }

  const row = await prisma.schoolStaffAssignment.upsert({
    where: { userId_schoolId: { userId: user.id, schoolId } },
    create: { userId: user.id, schoolId, staffRole },
    update: { staffRole },
  });

  console.log('OK —', email, '→', staffRole, 'sur', school.name, `(assignment ${row.id})`);
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
