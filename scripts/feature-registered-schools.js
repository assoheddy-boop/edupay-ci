/**
 * Met en avant les écoles inscrites (Marketplace + palier).
 * IGEST = VIP, catalogue EPV = PREMIUM. Ignore *@demo.ci. Ne change aucun mot de passe.
 * N’imprime jamais DATABASE_URL.
 *
 * Usage :
 *   NODE_OPTIONS=--use-system-ca node scripts/feature-registered-schools.js
 *   node scripts/feature-registered-schools.js --neon-only
 *   node scripts/feature-registered-schools.js --local-only
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { IGEST_SCHOOL } = require('../src/config/igestSchool');
const { CABEL_SCHOOL } = require('../src/config/cabelSchool');
const { EPV_SCHOOLS } = require('../src/config/epvSchools');

const CATALOG = [
  { name: IGEST_SCHOOL.name, slug: IGEST_SCHOOL.slug },
  { name: CABEL_SCHOOL.name, slug: CABEL_SCHOOL.slug },
  ...EPV_SCHOOLS.map((s) => ({ name: s.name, slug: s.slug })),
];

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

function isLocalUrl(url) {
  try {
    return /localhost|127\.0\.0\.1/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function maskDb(text) {
  return String(text || '').replace(/postgres(ql)?:\/\/[^\s]+/gi, '[DATABASE_URL]');
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

function resolveNeonUrl() {
  const root = path.resolve(__dirname, '..');
  const parsed = parseEnvFile(path.join(root, '.env.vercel-backup'));
  const neonFile = path.join(root, '.neon-url.tmp');
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

function resolveLocalUrl() {
  const root = path.resolve(__dirname, '..');
  const parsed = parseEnvFile(path.join(root, '.env'));
  const url = firstNonEmpty(parsed.DATABASE_URL, parsed.POSTGRES_PRISMA_URL, parsed.POSTGRES_URL);
  return url && isLocalUrl(url) ? url : '';
}

function spawnRun(url, label) {
  console.log(`\n── ${label} ──`);
  const result = spawnSync(process.execPath, [__filename, '--run'], {
    env: { ...process.env, DATABASE_URL: url, NODE_OPTIONS: '--use-system-ca' },
    stdio: 'inherit',
    shell: false,
  });
  return result.status || 0;
}

function isDemoEmail(email) {
  return String(email || '').trim().toLowerCase().endsWith('@demo.ci');
}

async function featureSchools() {
  const prisma = require('../src/config/database');
  const { initSchoolModules } = require('../src/utils/modules');
  const { applyMarketplaceOffer, MARKETPLACE_TIER } = require('../src/utils/marketplaceAddon');
  const featured = [];
  const skippedDemo = [];
  const notFound = [];

  try {
    for (const entry of CATALOG) {
      const slug = String(entry.slug || '').toLowerCase().trim();
      if (!slug) {
        notFound.push(entry);
        continue;
      }

      const school = await prisma.school.findFirst({
        where: { slug },
        select: {
          id: true,
          name: true,
          slug: true,
          publicPortalEnabled: true,
          publicFeatured: true,
          admin: { select: { email: true } },
        },
      });

      if (!school) {
        notFound.push({ name: entry.name, slug });
        continue;
      }

      if (isDemoEmail(school.admin?.email)) {
        skippedDemo.push({ name: school.name, slug: school.slug });
        continue;
      }

      await initSchoolModules(school.id);
      const tier = school.slug === IGEST_SCHOOL.slug
        ? MARKETPLACE_TIER.VIP
        : MARKETPLACE_TIER.PREMIUM;
      await applyMarketplaceOffer(school.id, {
        tier,
        publish: true,
        enableModule: true,
      });

      featured.push({ name: school.name, slug: school.slug, tier });
    }

    console.log(`Écoles Marketplace activées (${featured.length}) :`);
    if (!featured.length) console.log('  (aucune)');
    featured.forEach((row) => console.log(`  - ${row.name} (${row.slug}) · ${row.tier}`));

    if (skippedDemo.length) {
      console.log(`Ignorées *@demo.ci (${skippedDemo.length}) :`);
      skippedDemo.forEach((row) => console.log(`  - ${row.name} (${row.slug})`));
    }

    if (notFound.length) {
      console.log(`Introuvables (${notFound.length}) :`);
      notFound.forEach((row) => console.log(`  - ${row.name} (${row.slug})`));
    }

    return { featured, skippedDemo, notFound };
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--run')) {
    return featureSchools()
      .catch((err) => {
        console.error(maskDb(err?.message || err));
        process.exitCode = 1;
      })
      .finally(() => {
        process.exit(process.exitCode || 0);
      });
  }

  const neonOnly = args.includes('--neon-only');
  const localOnly = args.includes('--local-only');
  let exitCode = 0;

  if (!localOnly) {
    const neonUrl = resolveNeonUrl();
    if (!neonUrl) {
      console.error('Aucune URL Neon (fichier de secours / neonctl).');
      exitCode = 1;
    } else {
      exitCode = spawnRun(neonUrl, describeTarget(neonUrl)) || exitCode;
    }
  }

  if (!neonOnly) {
    const localUrl = resolveLocalUrl();
    if (localUrl) {
      const localStatus = spawnRun(localUrl, describeTarget(localUrl));
      if (localStatus) {
        console.warn('Mise en avant locale en échec (PostgreSQL local absent ?). Neon n’est pas annulé.');
        if (localOnly) exitCode = localStatus;
      }
    } else if (localOnly) {
      console.error('Pas d’URL PostgreSQL locale dans .env.');
      exitCode = 1;
    } else {
      console.log('Pas de PostgreSQL local détecté dans .env — Neon seulement.');
    }
  }

  process.exit(exitCode);
}

if (require.main === module) {
  Promise.resolve(main()).catch((err) => {
    console.error(maskDb(err?.message || err));
    process.exit(1);
  });
}

module.exports = { CATALOG, featureSchools };
