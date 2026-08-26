/**
 * Idempotent purge of EduConnect demo accounts.
 * Never deletes IGEST / EPV / extra partner schools.
 * Does not embed live passwords.
 *
 * Usage:
 *   node scripts/purge-demo-accounts.js           # DATABASE_URL (local)
 *   node scripts/purge-demo-accounts.js --prod    # Neon project ancient-cloud-90631299
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const { EPV_SCHOOLS } = require('../src/config/epvSchools');
const { EXTRA_SCHOOLS } = require('../src/config/extraSchools');
const { IGEST_SCHOOL } = require('../src/config/igestSchool');
const { hashPassword, comparePassword } = require('../src/utils/password');

const SUPER_ADMIN_DEMO_EMAIL = 'admin@educonnect.ci';
const SUPER_ADMIN_EMAILS = new Set(['admin@educonnect.ci', 'admin@edupay.ci']);

const DEMO_EMAIL_ALLOWLIST = [
  'ecole@demo.ci',
  'parent@demo.ci',
  'prof@demo.ci',
  'groupe@demo.ci',
  'ecole.yopougon@demo.ci',
  'prof.francais@demo.ci',
  'prof.sciences@demo.ci',
  'prof.eps@demo.ci',
  'parent2@demo.ci',
  'parent3@demo.ci',
  'parent4@demo.ci',
];

const DEMO_SCHOOL_SLUGS = ['ecole-les-etoiles', 'ecole-les-etoiles-yopougon'];
const DEMO_ORG_SLUGS = ['groupe-les-etoiles'];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const PROTECTED_EMAILS = new Set(
  [IGEST_SCHOOL.admin.email, ...EPV_SCHOOLS.map((s) => s.admin?.email), ...EXTRA_SCHOOLS.map((s) => s.admin?.email)]
    .map(normalizeEmail)
    .filter(Boolean),
);

const PROTECTED_SLUGS = new Set(
  [IGEST_SCHOOL.slug, ...EPV_SCHOOLS.map((s) => s.slug), ...EXTRA_SCHOOLS.map((s) => s.slug)].filter(Boolean),
);

function isProtectedEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return true;
  if (PROTECTED_EMAILS.has(e)) return true;
  if (/^epv\..+@(edupay|educonnect)\.ci$/i.test(e)) return true;
  if (/^igest@(edupay|educonnect)\.ci$/i.test(e)) return true;
  if (/^cabel@(edupay|educonnect)\.ci$/i.test(e)) return true;
  return false;
}

function isDemoEmail(email) {
  const e = normalizeEmail(email);
  if (!e || isProtectedEmail(e)) return false;
  if (e.endsWith('@demo.ci')) return true;
  return DEMO_EMAIL_ALLOWLIST.includes(e);
}

function readText(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.slice(2).toString('utf16le');
  }
  return buf.toString('utf8').replace(/^\uFEFF/, '');
}

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const text = readText(filePath);
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function firstNonEmpty(...values) {
  return values.find((value) => value && value.length > 8 && !/^["']{0,2}$/.test(value)) || '';
}

function neonUrlFromFile(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return readText(filePath).split(/\r?\n/).map((line) => line.trim()).filter((line) => /^postgres(ql)?:\/\//i.test(line)).pop() || '';
}

function fetchNeonUrl() {
  const projectId = process.env.NEON_PROJECT_ID || 'ancient-cloud-90631299';
  const result = spawnSync(
    'npx',
    ['--yes', 'neonctl', 'connection-string', '--project-id', projectId, '--pooled'],
    {
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, NODE_OPTIONS: '--use-system-ca' },
    },
  );
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^postgres(ql)?:\/\//i.test(line)).pop() || '';
}

function resolveProdUrl() {
  const envFile = path.resolve(__dirname, '../.env.vercel-backup');
  const parsed = parseEnvFile(envFile);
  const neonFile = path.resolve(__dirname, '../.neon-url.tmp');
  let url = firstNonEmpty(
    parsed.DATABASE_URL,
    parsed.POSTGRES_PRISMA_URL,
    parsed.POSTGRES_URL,
    parsed.DATABASE_URL_UNPOOLED,
    neonUrlFromFile(neonFile),
  );
  if (!url) {
    console.log('Récupération de l’URL Neon (masquée)…');
    url = fetchNeonUrl();
    if (url) fs.writeFileSync(neonFile, `${url}\n`);
  }
  return url;
}

function labelTarget(isProd) {
  return isProd ? 'neon-prod (ancient-cloud-90631299)' : 'local (DATABASE_URL)';
}

async function unlinkTeacherRefs(prisma, teacherIds) {
  if (!teacherIds.length) return;
  await prisma.absence.updateMany({
    where: { recordedBy: { in: teacherIds } },
    data: { recordedBy: null },
  });
  await prisma.grade.deleteMany({ where: { teacherId: { in: teacherIds } } });
  await prisma.homework.deleteMany({ where: { teacherId: { in: teacherIds } } });
  await prisma.behaviorNote.deleteMany({ where: { teacherId: { in: teacherIds } } });
  await prisma.badge.deleteMany({ where: { teacherId: { in: teacherIds } } });
}

async function deleteMessagesForUsers(prisma, userIds) {
  if (!userIds.length) return;
  await prisma.message.deleteMany({
    where: {
      OR: [{ senderId: { in: userIds } }, { receiverId: { in: userIds } }],
    },
  });
}

async function deleteSchoolGraph(prisma, school) {
  const teachers = await prisma.teacher.findMany({ where: { schoolId: school.id } });
  const teacherIds = teachers.map((t) => t.id);
  const leftoverUserIds = [school.adminId, ...teachers.map((t) => t.userId)].filter(Boolean);
  const students = await prisma.student.findMany({ where: { schoolId: school.id }, select: { id: true } });
  const studentIds = students.map((s) => s.id);

  let parentUserIds = [];
  if (studentIds.length) {
    const links = await prisma.parentStudent.findMany({
      where: { studentId: { in: studentIds } },
      include: { parent: true },
    });
    parentUserIds = links.map((l) => l.parent?.userId).filter(Boolean);
    await prisma.message.deleteMany({ where: { studentId: { in: studentIds } } });
  }

  await unlinkTeacherRefs(prisma, teacherIds);
  await deleteMessagesForUsers(prisma, leftoverUserIds);
  await prisma.school.delete({ where: { id: school.id } });
  return { leftoverUserIds: [...new Set([...leftoverUserIds, ...parentUserIds])] };
}

async function deleteUserSafe(prisma, userId) {
  await deleteMessagesForUsers(prisma, [userId]);
  const teacher = await prisma.teacher.findUnique({ where: { userId } });
  if (teacher) await unlinkTeacherRefs(prisma, [teacher.id]);
  await prisma.user.delete({ where: { id: userId } });
}

function generateAdminPassword() {
  return `EduA-${crypto.randomBytes(9).toString('base64url')}!`;
}

async function purge(prisma) {
  const result = {
    deletedEmails: [],
    deletedSchools: [],
    deletedOrgs: [],
    adminAction: 'unchanged',
    adminPassword: null,
    igest: null,
    superAdminCount: 0,
  };

  const allUsers = await prisma.user.findMany({
    include: { school: true, teacher: true, organizationAdmin: true },
  });

  const demoUsers = allUsers.filter((u) => isDemoEmail(u.email));
  const demoUserIds = new Set(demoUsers.map((u) => u.id));

  const schools = await prisma.school.findMany({ include: { admin: true } });
  const demoSchools = schools.filter((school) => {
    if (PROTECTED_SLUGS.has(school.slug)) return false;
    if (school.admin?.email && isProtectedEmail(school.admin.email)) return false;
    if (school.slug && DEMO_SCHOOL_SLUGS.includes(school.slug)) return true;
    if (school.adminId && demoUserIds.has(school.adminId)) return true;
    if (school.admin?.email && isDemoEmail(school.admin.email)) return true;
    return false;
  });

  const orphanUserIds = new Set();
  for (const school of demoSchools) {
    const { leftoverUserIds } = await deleteSchoolGraph(prisma, school);
    leftoverUserIds.forEach((id) => orphanUserIds.add(id));
    result.deletedSchools.push(school.slug || school.name);
  }

  for (const slug of DEMO_ORG_SLUGS) {
    const org = await prisma.organization.findUnique({
      where: { slug },
      include: { schools: { select: { id: true, slug: true } }, admins: true },
    });
    if (!org) continue;
    const hasProtectedSchool = org.schools.some((s) => PROTECTED_SLUGS.has(s.slug));
    if (hasProtectedSchool) {
      console.log(`Organisation ${slug} conservée (écoles partenaires liées).`);
      continue;
    }
    if (org.schools.length) {
      console.log(`Organisation ${slug} encore liée à ${org.schools.length} école(s) non-démo — admins démo seulement.`);
      continue;
    }
    org.admins.forEach((a) => orphanUserIds.add(a.userId));
    await prisma.organization.delete({ where: { id: org.id } });
    result.deletedOrgs.push(slug);
  }

  const remaining = await prisma.user.findMany();
  const toDelete = remaining.filter((u) => {
    if (isProtectedEmail(u.email)) return false;
    if (SUPER_ADMIN_EMAILS.has(normalizeEmail(u.email))) return false;
    return isDemoEmail(u.email) || orphanUserIds.has(u.id);
  });

  for (const user of toDelete) {
    try {
      await deleteUserSafe(prisma, user.id);
      result.deletedEmails.push(user.email);
    } catch (err) {
      console.error(`Échec suppression ${user.email}:`, err.message);
    }
  }

  const superAdmins = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN' } });
  result.superAdminCount = superAdmins.length;
  const admin = superAdmins.find((u) => SUPER_ADMIN_EMAILS.has(normalizeEmail(u.email)));

  if (admin) {
    const others = superAdmins.filter((u) => u.id !== admin.id);
    if (others.length) {
      await deleteUserSafe(prisma, admin.id);
      result.deletedEmails.push(admin.email);
      result.adminAction = 'deleted (other SUPER_ADMIN present)';
    } else {
      const isDemoPassword = await comparePassword('demo1234', admin.password);
      if (isDemoPassword) {
        const password = generateAdminPassword();
        await prisma.user.update({
          where: { id: admin.id },
          data: { password: await hashPassword(password) },
        });
        result.adminAction = 'password rotated';
        result.adminPassword = password;
      } else {
        result.adminAction = 'kept (already not demo1234)';
      }
    }
  } else {
    result.adminAction = 'absent';
  }

  const igest = await prisma.user.findUnique({
    where: { email: IGEST_SCHOOL.admin.email },
    include: { school: true },
  });
  result.igest = igest
    ? { email: igest.email, role: igest.role, school: igest.school?.slug || igest.school?.name || null }
    : null;

  result.superAdminCount = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
  result.deletedEmails = [...new Set(result.deletedEmails)].sort();
  return result;
}

async function main() {
  const isProd = process.argv.includes('--prod');
  if (isProd) {
    const url = resolveProdUrl();
    if (!url) {
      console.error('Aucune URL Neon trouvée (.env.vercel-backup / neonctl).');
      process.exit(1);
    }
    process.env.DATABASE_URL = url;
  } else {
    require('dotenv/config');
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL manquant.');
      process.exit(1);
    }
  }

  console.log(`Purge comptes démo — cible : ${labelTarget(isProd)}`);

  const prisma = require('../src/config/database');
  try {
    const result = await purge(prisma);
    console.log(JSON.stringify({
      target: labelTarget(isProd),
      deletedEmails: result.deletedEmails,
      deletedSchools: result.deletedSchools,
      deletedOrgs: result.deletedOrgs,
      adminAction: result.adminAction,
      igest: result.igest,
      superAdminCount: result.superAdminCount,
    }, null, 2));
    if (result.adminPassword) {
      console.log(`ADMIN_PASSWORD_ONCE=${result.adminPassword}`);
    }
    if (!result.igest) {
      console.warn(`ATTENTION : ${IGEST_SCHOOL.admin.email} introuvable après purge.`);
    }
    if (result.superAdminCount < 1) {
      console.error('ERREUR : plus aucun SUPER_ADMIN.');
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
    process.exit(process.exitCode || 0);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  DEMO_EMAIL_ALLOWLIST,
  SUPER_ADMIN_DEMO_EMAIL,
  isDemoEmail,
  isProtectedEmail,
};
