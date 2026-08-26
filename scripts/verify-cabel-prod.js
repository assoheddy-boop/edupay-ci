/**
 * Vérifie la présence de CABEL en base (Neon prod).
 * N’imprime jamais DATABASE_URL.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function readText(filePath) {
  if (!fs.existsSync(filePath)) return '';
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

function resolveDatabaseUrl() {
  const root = path.resolve(__dirname, '..');
  const parsed = parseEnvFile(path.join(root, '.env.vercel-backup'));
  const neonFile = path.join(root, '.neon-url.tmp');
  return firstNonEmpty(
    parsed.DATABASE_URL,
    parsed.POSTGRES_PRISMA_URL,
    parsed.POSTGRES_URL,
    parsed.DATABASE_URL_UNPOOLED,
    neonUrlFromFile(neonFile),
  );
}

async function runVerify() {
  const prisma = require('../src/config/database');
  try {
    const school = await prisma.school.findUnique({
      where: { slug: 'cabel-cocody' },
      include: {
        admin: { select: { email: true, role: true, firstName: true, lastName: true } },
        modules: { where: { moduleKey: 'marketplace' } },
      },
    });
    if (!school) {
      console.error('École cabel-cocody introuvable.');
      process.exit(1);
    }
    console.log(JSON.stringify({
      id: school.id,
      name: school.name,
      slug: school.slug,
      logoUrl: school.logoUrl,
      publicPortalEnabled: school.publicPortalEnabled,
      marketplaceTier: school.marketplaceTier,
      publicFeatured: school.publicFeatured,
      educationCycle: school.educationCycle,
      commune: school.commune,
      city: school.city,
      directorName: school.directorName,
      adminEmail: school.admin?.email,
      adminRole: school.admin?.role,
      marketplaceModuleEnabled: school.modules?.[0]?.enabled ?? false,
    }, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

function main() {
  const url = resolveDatabaseUrl();
  if (!url) {
    console.error('URL Neon introuvable (.neon-url.tmp / .env.vercel-backup).');
    process.exit(1);
  }

  if (process.argv.includes('--run')) {
    return runVerify().catch((err) => {
      console.error(err?.message || err);
      process.exit(1);
    });
  }

  const child = spawnSync(process.execPath, [__filename, '--run'], {
    env: { ...process.env, DATABASE_URL: url, NODE_OPTIONS: '--use-system-ca' },
    stdio: 'inherit',
    shell: false,
  });
  process.exit(child.status || 0);
}

main();
