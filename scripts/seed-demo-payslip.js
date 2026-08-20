/**
 * Crée / met à jour un bulletin de paie démo IGEST (référence IGES Warren Kayeda).
 *
 * Usage :
 *   node scripts/seed-demo-payslip.js
 *   node scripts/seed-demo-payslip.js --month=3 --year=2026
 *
 * Cible Neon prod (.neon-url.tmp / .env.vercel-backup) ou DATABASE_URL locale.
 * N’imprime jamais DATABASE_URL.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SLUG = 'igest-yopougon-sideci';
const DEMO_MATRICULE = '026-IGES-22';
const DEFAULT_MONTH = 3;
const DEFAULT_YEAR = 2026;

const DEMO_EMPLOYEE = {
  lastName: 'KAYEDA',
  firstName: 'WARREN KEMONAHO',
  staffMatricule: DEMO_MATRICULE,
  birthDate: new Date('1993-05-01'),
  cnpsNumber: '202 500 145 402',
  taxParts: 2,
  nationality: 'IVOIRIENNE',
  maritalStatus: 'CELIBATAIRE',
  jobTitle: 'EDUCATEUR DE NIVEAUX',
  hireDate: new Date('2022-10-01'),
  baseSalary: 75000,
  transportAllowance: 30000,
  contractType: 'CDI',
  status: 'ACTIVE',
};

/** Rubriques école pour reproduire le bulletin IGES (net 99 997 F). */
const RUBRIQUE_OVERRIDES = [
  { code: '211', rate: 4 },
  { code: '810', rate: 6.3 },
  { code: '820', rate: 1.2 },
  { code: '835', fixedAmount: 186 },
  { code: '840', fixedAmount: 192 },
  { code: '204', fixedAmount: 30000 },
  { code: '512', fixedAmount: 2000 },
];

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
  for (const rawLine of readText(filePath).split(/\r?\n/)) {
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

function describeTarget(url) {
  try {
    const host = new URL(url).hostname;
    if (/localhost|127\.0\.0\.1/i.test(host)) return 'PostgreSQL local';
    if (/neon\.tech|neon\.build/i.test(host)) return 'Neon production';
    return 'PostgreSQL distant';
  } catch {
    return 'base configurée';
  }
}

function resolveDatabaseUrl() {
  const root = path.resolve(__dirname, '..');
  const parsed = parseEnvFile(path.join(root, '.env.vercel-backup'));
  const neonFile = path.join(root, '.neon-url.tmp');
  let url = firstNonEmpty(
    process.env.DATABASE_URL,
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

function parseArgs() {
  let month = DEFAULT_MONTH;
  let year = DEFAULT_YEAR;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--month=')) month = parseInt(arg.slice('--month='.length), 10);
    if (arg.startsWith('--year=')) year = parseInt(arg.slice('--year='.length), 10);
  }
  return { month, year };
}

async function seedDemoPayslip() {
  const { month, year } = parseArgs();
  const prisma = require('../src/config/database');
  const { saveSchoolRubriqueOverrides } = require('../src/services/paySlipService');
  const { generateStaffPayroll } = require('../src/services/hrPayrollService');
  const { IGEST_SCHOOL } = require('../src/config/igestSchool');

  const school = await prisma.school.findFirst({
    where: { slug: IGEST_SCHOOL.slug || SLUG },
  });
  if (!school) {
    console.error(`École IGEST introuvable (slug ${SLUG}).`);
    process.exit(1);
  }

  console.log(`École : ${school.name} (${school.slug})`);
  console.log(`Période : ${String(month).padStart(2, '0')}/${year}`);

  await saveSchoolRubriqueOverrides(school.id, RUBRIQUE_OVERRIDES);

  let profile = await prisma.staffProfile.findFirst({
    where: { schoolId: school.id, staffMatricule: DEMO_MATRICULE },
  });

  if (profile) {
    profile = await prisma.staffProfile.update({
      where: { id: profile.id },
      data: { ...DEMO_EMPLOYEE, schoolId: school.id },
    });
    console.log(`Profil mis à jour : ${profile.id}`);
  } else {
    profile = await prisma.staffProfile.create({
      data: { ...DEMO_EMPLOYEE, schoolId: school.id },
    });
    console.log(`Profil créé : ${profile.id}`);
  }

  const period = `${year}-${String(month).padStart(2, '0')}`;
  const existingRun = await prisma.payrollRun.findUnique({
    where: { schoolId_month_year: { schoolId: school.id, month, year } },
  });
  if (existingRun?.status === 'PAID') {
    console.error('La paie de cette période est déjà marquée payée — arrêt.');
    process.exit(1);
  }

  const result = await generateStaffPayroll(profile.id, period);
  if (!result.ok) {
    console.error('Échec génération bulletin :', result.error || 'unknown');
    process.exit(1);
  }

  const payslip = result.payslip;
  const employeeName = `${DEMO_EMPLOYEE.lastName} ${DEMO_EMPLOYEE.firstName}`;
  const previewPath = `/school/hr/payslip/${payslip.id}/preview`;
  const pdfPath = `/school/hr/payslip/${payslip.id}/pdf`;

  console.log('\n── Bulletin démo IGEST ──');
  console.log(`Employé   : ${employeeName}`);
  console.log(`Matricule : ${DEMO_MATRICULE}`);
  console.log(`Net à payer : ${result.netPay?.toLocaleString('fr-FR')} FCFA`);
  console.log(`Payslip ID : ${payslip.id}`);
  console.log(`Preview    : ${previewPath}`);
  console.log(`PDF        : ${pdfPath}`);
  if (result.pdfUrl) console.log(`PDF stocké : ${result.pdfUrl}`);
  console.log('\nConnexion : compta@igest.educonnect.ci ou igest@educonnect.ci (module RH requis).');
  console.log(`Liste paie : /school/hr/payroll?month=${month}&year=${year}`);

  await prisma.$disconnect();
}

if (require.main === module) {
  const isRun = process.argv.includes('--run');
  if (!isRun) {
    const url = resolveDatabaseUrl();
    if (!url) {
      console.error('Aucune URL de base trouvée (.neon-url.tmp / .env.vercel-backup / neonctl).');
      process.exit(1);
    }
    console.log(`Cible : ${describeTarget(url)}`);
    const env = { ...process.env, DATABASE_URL: url, NODE_OPTIONS: '--use-system-ca' };
    const result = spawnSync(process.execPath, [__filename, '--run'], {
      env,
      stdio: 'inherit',
      shell: false,
    });
    process.exit(result.status || 0);
  }

  seedDemoPayslip().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { seedDemoPayslip, DEMO_EMPLOYEE, RUBRIQUE_OVERRIDES };
