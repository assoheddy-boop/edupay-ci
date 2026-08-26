/**
 * Intègre le Collège Privé Alice de Bel (CABEL) en production Neon.
 * Lit l’URL depuis .neon-url.tmp ou .env.vercel-backup — jamais de secret embarqué.
 *
 * Usage :
 *   node scripts/setup-alice-de-bel.js
 *   node scripts/setup-alice-de-bel.js --local
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

function resolveDatabaseUrl(useLocal) {
  const root = path.resolve(__dirname, '..');
  if (useLocal) {
    const parsed = parseEnvFile(path.join(root, '.env'));
    return firstNonEmpty(parsed.DATABASE_URL, parsed.POSTGRES_PRISMA_URL, parsed.POSTGRES_URL);
  }
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

async function runWithDatabaseUrl(url) {
  process.env.DATABASE_URL = url;

  const { CABEL_SCHOOL } = require('../src/config/cabelSchool');
  const { validateEpvCatalog, generateTempPassword } = require('../src/config/epvSchools');
  const { onboardSchools } = require('../src/utils/onboardSchools');
  const { applyMarketplaceOffer, MARKETPLACE_TIER } = require('../src/utils/marketplaceAddon');
  const { initSchoolModules } = require('../src/utils/modules');
  const { portalPath } = require('../src/utils/publicPortal');
  const prisma = require('../src/config/database');

  const catalog = validateEpvCatalog([CABEL_SCHOOL]);
  if (!catalog.ok) {
    throw new Error(`Catalogue CABEL invalide: ${catalog.errors.join('; ')}`);
  }

  const logoPath = path.resolve(__dirname, '..', CABEL_SCHOOL.logoFile);
  if (!fs.existsSync(logoPath)) {
    throw new Error(`Logo introuvable: ${CABEL_SCHOOL.logoFile}`);
  }

  try {
    const password = process.env.ONBOARD_TEMP_PASSWORD || generateTempPassword(CABEL_SCHOOL.slug);
    const [result] = await onboardSchools([CABEL_SCHOOL], { planSlug: 'premium', password });

    const school = await prisma.school.findUnique({
      where: { slug: CABEL_SCHOOL.slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        publicPortalEnabled: true,
        marketplaceTier: true,
        admin: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    if (school) {
      await initSchoolModules(school.id);
      await applyMarketplaceOffer(school.id, {
        tier: MARKETPLACE_TIER.PREMIUM,
        publish: true,
        enableModule: true,
      });
    }

    const baseUrl = 'https://educonnect-ci.com';
    const slug = school?.slug || result.slug;
    const shownPassword = result.password || password;

    console.log('\n✅ Collège Privé Alice de Bel (CABEL) — intégration terminée\n');
    console.log(`Statut       : ${result.status}`);
    console.log(`ID école     : ${school?.id || '(voir base)'}`);
    console.log(`Nom          : ${school?.name || result.name}`);
    console.log(`Slug / code  : ${slug}`);
    console.log(`Logo         : ${school?.logoUrl || CABEL_SCHOOL.logoFile}`);
    console.log(`Direction    : ${school?.admin?.email || result.email}`);
    if (shownPassword) console.log(`Mot de passe : ${shownPassword}`);
    console.log('');
    console.log('URLs :');
    console.log(`  Portail public : ${baseUrl}${portalPath(slug)}`);
    console.log(`  Marketplace    : ${baseUrl}/ecoles`);
    console.log(`  Connexion      : ${baseUrl}/auth`);
    console.log(`  Tableau de bord: ${baseUrl}/school`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

function main() {
  const useLocal = process.argv.includes('--local');
  const url = resolveDatabaseUrl(useLocal);
  if (!url) {
    console.error(useLocal
      ? 'Pas d’URL PostgreSQL locale (.env).'
      : 'Aucune URL Neon (.neon-url.tmp / .env.vercel-backup / neonctl).');
    process.exit(1);
  }

  // Sous-processus pour garantir DATABASE_URL avant tout chargement Prisma/dotenv.
  if (process.argv.includes('--run')) {
    return runWithDatabaseUrl(url).catch((err) => {
      console.error(err?.message || err);
      process.exit(1);
    });
  }

  const env = { ...process.env, DATABASE_URL: url, NODE_OPTIONS: '--use-system-ca' };
  const child = spawnSync(process.execPath, [__filename, '--run'], {
    env,
    stdio: 'inherit',
    shell: false,
  });
  process.exit(child.status || 0);
}

main();
