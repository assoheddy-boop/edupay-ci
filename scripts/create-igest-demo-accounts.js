/**
 * Create missing IGEST demo staff/student accounts on Neon prod.
 * Never prints DATABASE_URL or password hashes.
 * Usage: node scripts/create-igest-demo-accounts.js [--dry-run]
 */
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const STAFF_ACCOUNTS = [
  {
    email: 'secretariat@igest.educonnect.ci',
    password: 'Igest-Secret2026!',
    firstName: 'Demo',
    lastName: 'Secrétariat',
    staffRole: 'SECRETARIAT',
  },
  {
    email: 'compta@igest.educonnect.ci',
    password: 'Igest-Compta2026!',
    firstName: 'Demo',
    lastName: 'Comptabilité',
    staffRole: 'ACCOUNTANT',
  },
  {
    email: 'educateur@igest.educonnect.ci',
    password: 'Igest-Educ2026!',
    firstName: 'Demo',
    lastName: 'Éducateur',
    staffRole: 'EDUCATOR',
  },
  {
    email: 'viescolaire@igest.educonnect.ci',
    password: 'Igest-VieSco2026!',
    firstName: 'Demo',
    lastName: 'Vie scolaire',
    staffRole: 'LIFE_SCHOOL',
  },
];

const STUDENT_ACCOUNT = {
  email: 'eleve.demo@igest.educonnect.ci',
  password: 'Igest-Eleve2026!',
  matricule: 'IG-DEMO-001',
};

function readNeonUrl() {
  const neonFile = path.join(__dirname, '../.neon-url.tmp');
  if (fs.existsSync(neonFile)) {
    const line = fs.readFileSync(neonFile, 'utf8').split(/\r?\n/).find((l) => /^postgres/i.test(l.trim()));
    if (line) return line.trim();
  }
  const { spawnSync } = require('child_process');
  const projectId = process.env.NEON_PROJECT_ID || 'ancient-cloud-90631299';
  const result = spawnSync(
    'npx',
    ['--yes', 'neonctl', 'connection-string', '--project-id', projectId, '--pooled'],
    { encoding: 'utf8', shell: true, env: { ...process.env, NODE_OPTIONS: '--use-system-ca' } },
  );
  const line = `${result.stdout || ''}\n${result.stderr || ''}`
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^postgres(ql)?:\/\//i.test(l));
  if (line) {
    fs.writeFileSync(neonFile, `${line}\n`);
    return line;
  }
  return null;
}

async function ensureStaffUser(prisma, schoolId, account, dryRun) {
  const email = account.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  const hashed = await bcrypt.hash(account.password, 10);

  if (!user) {
    if (dryRun) {
      console.log(`WOULD CREATE staff: ${email} (${account.staffRole})`);
      return;
    }
    user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        firstName: account.firstName,
        lastName: account.lastName,
        role: 'SCHOOL_ADMIN',
        isActive: true,
      },
    });
    console.log(`CREATED user: ${email}`);
  } else {
    const ok = await bcrypt.compare(account.password, user.password);
    if (!ok) {
      if (dryRun) {
        console.log(`WOULD RESET password: ${email}`);
      } else {
        await prisma.user.update({ where: { id: user.id }, data: { password: hashed, isActive: true } });
        console.log(`RESET password: ${email}`);
      }
    } else {
      console.log(`OK password: ${email}`);
    }
  }

  const director = await prisma.school.findUnique({ where: { id: schoolId }, select: { adminId: true } });
  if (director?.adminId === user.id) {
    console.log(`SKIP staff assignment (director): ${email}`);
    return;
  }

  const assignment = await prisma.schoolStaffAssignment.findUnique({
    where: { userId_schoolId: { userId: user.id, schoolId } },
  });
  if (!assignment) {
    if (dryRun) {
      console.log(`WOULD ASSIGN ${account.staffRole}: ${email}`);
      return;
    }
    await prisma.schoolStaffAssignment.create({
      data: { userId: user.id, schoolId, staffRole: account.staffRole },
    });
    console.log(`ASSIGNED ${account.staffRole}: ${email}`);
  } else if (assignment.staffRole !== account.staffRole) {
    if (dryRun) {
      console.log(`WOULD UPDATE role ${assignment.staffRole} -> ${account.staffRole}: ${email}`);
    } else {
      await prisma.schoolStaffAssignment.update({
        where: { id: assignment.id },
        data: { staffRole: account.staffRole },
      });
      console.log(`UPDATED role: ${email} -> ${account.staffRole}`);
    }
  } else {
    console.log(`OK assignment: ${email} (${account.staffRole})`);
  }
}

async function ensureStudentUser(prisma, schoolId, dryRun) {
  const email = STUDENT_ACCOUNT.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const ok = await bcrypt.compare(STUDENT_ACCOUNT.password, existing.password);
    if (ok) {
      console.log(`OK student account: ${email}`);
      return;
    }
    if (dryRun) {
      console.log(`WOULD RESET student password: ${email}`);
      return;
    }
    const hashed = await bcrypt.hash(STUDENT_ACCOUNT.password, 10);
    await prisma.user.update({ where: { id: existing.id }, data: { password: hashed, isActive: true } });
    console.log(`RESET student password: ${email}`);
    return;
  }

  const student = await prisma.student.findFirst({
    where: { schoolId, matricule: STUDENT_ACCOUNT.matricule },
    include: { user: true },
  });
  if (!student) {
    console.log(`SKIP student: no Student with matricule ${STUDENT_ACCOUNT.matricule} at IGEST`);
    return;
  }
  if (student.user) {
    console.log(`SKIP student: already linked to ${student.user.email || 'user'}`);
    return;
  }
  if (dryRun) {
    console.log(`WOULD CREATE student account: ${email} -> ${STUDENT_ACCOUNT.matricule}`);
    return;
  }

  const hashed = await bcrypt.hash(STUDENT_ACCOUNT.password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      firstName: student.firstName,
      lastName: student.lastName,
      role: 'STUDENT',
      studentId: student.id,
      isActive: true,
    },
  });
  console.log(`CREATED student account: ${email} (user ${user.id})`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = readNeonUrl();
  if (!url) {
    console.error('Neon URL introuvable');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const school = await prisma.school.findFirst({
    where: { slug: 'igest-yopougon-sideci' },
    select: { id: true, name: true },
  });
  if (!school) {
    console.error('École IGEST introuvable (slug igest-yopougon-sideci)');
    process.exit(1);
  }
  console.log(`IGEST: ${school.name} (${school.id})`);

  for (const account of STAFF_ACCOUNTS) {
    await ensureStaffUser(prisma, school.id, account, dryRun);
  }
  await ensureStudentUser(prisma, school.id, dryRun);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
