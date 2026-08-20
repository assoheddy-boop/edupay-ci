/**
 * Backfill official bulletin identity fields from catalog config (Neon prod).
 * Never prints DATABASE_URL.
 *
 * Usage:
 *   node scripts/backfill-school-official-identity.js [--slug=igest-yopougon-sideci] [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { EPV_SCHOOLS, pickSchoolFields } = require('../src/config/epvSchools');
const { EXTRA_SCHOOLS } = require('../src/config/extraSchools');
const { buildBulletinHeaderModel } = require('../src/utils/schoolOfficialIdentity');

const OFFICIAL_KEYS = [
  'officialName',
  'menetAgrement',
  'menetCode',
  'nccNumber',
  'postalAddress',
  'publicPhones',
  'educationLevels',
  'dren',
  'directorName',
];

const SELECT_COLS = ['id', 'name', 'slug', ...OFFICIAL_KEYS, 'secondaryLogoUrl', 'publicPhone'];
const CATALOG = [...EPV_SCHOOLS, ...EXTRA_SCHOOLS];

function readNeonUrl() {
  const root = path.resolve(__dirname, '..');
  const neonFile = path.join(root, '.neon-url.tmp');
  if (fs.existsSync(neonFile)) {
    const line = fs.readFileSync(neonFile, 'utf8')
      .split(/\r?\n/)
      .find((l) => /^postgres(ql)?:\/\//i.test(l.trim()));
    if (line) return line.trim();
  }
  const backup = path.join(root, '.env.vercel-backup');
  if (!fs.existsSync(backup)) return null;
  for (const raw of fs.readFileSync(backup, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('DATABASE_URL=')) continue;
    let v = line.slice('DATABASE_URL='.length).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (/neon\.tech|neon\.build/i.test(v)) return v;
  }
  return null;
}

function trimOrNull(v) {
  const s = String(v ?? '').trim();
  return s || null;
}

function officialSnapshot(school) {
  const out = {};
  for (const key of OFFICIAL_KEYS) out[key] = trimOrNull(school?.[key]);
  out.secondaryLogoUrl = trimOrNull(school?.secondaryLogoUrl);
  return out;
}

function diffOfficial(before, after) {
  const changed = [];
  for (const key of OFFICIAL_KEYS) {
    if (before[key] !== after[key]) changed.push(key);
  }
  return changed;
}

function headerComplete(header) {
  return Boolean(
    header.displayName
    && header.agrementLine
    && header.educationLevels
    && header.contactRow
    && header.dren
    && header.directorName,
  );
}

function findCatalogDef(slug) {
  return CATALOG.find((s) => s.slug === slug) || null;
}

async function fetchSchool(pool, slug) {
  const cols = SELECT_COLS.map((c) => `"${c}"`).join(', ');
  const { rows } = await pool.query(`SELECT ${cols} FROM "School" WHERE slug = $1 LIMIT 1`, [slug]);
  return rows[0] || null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const slugArg = args.find((a) => a.startsWith('--slug='));
  const slug = slugArg ? slugArg.slice('--slug='.length) : 'igest-yopougon-sideci';

  const def = findCatalogDef(slug);
  if (!def) {
    console.error(`Catalogue: aucune ecole pour slug "${slug}"`);
    process.exit(1);
  }

  const url = readNeonUrl();
  if (!url) {
    console.error('Neon URL introuvable (.neon-url.tmp / .env.vercel-backup)');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  const existing = await fetchSchool(pool, slug);
  if (!existing) {
    console.error(`Ecole introuvable en base: ${slug}`);
    await pool.end();
    process.exit(1);
  }

  const picked = pickSchoolFields(def, existing);
  const data = {};
  for (const key of OFFICIAL_KEYS) {
    if (picked[key] !== undefined) data[key] = picked[key];
  }

  const before = officialSnapshot(existing);
  const after = { ...before };
  for (const key of OFFICIAL_KEYS) after[key] = trimOrNull(data[key]);

  const changedKeys = diffOfficial(before, after);
  const needsUpdate = changedKeys.length > 0;

  console.log(`School: ${existing.name} (${slug})`);
  console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);

  if (!needsUpdate) {
    console.log('Status: already set (official fields match catalog)');
  } else {
    console.log(`Status: will update (${changedKeys.join(', ')})`);
    if (!dryRun) {
      const sets = [];
      const vals = [];
      let i = 1;
      for (const key of OFFICIAL_KEYS) {
        if (data[key] === undefined) continue;
        sets.push(`"${key}" = $${i++}`);
        vals.push(data[key]);
      }
      if (sets.length) {
        vals.push(existing.id);
        await pool.query(`UPDATE "School" SET ${sets.join(', ')} WHERE id = $${i}`, vals);
      }
    }
  }

  const refreshed = needsUpdate && !dryRun ? (await fetchSchool(pool, slug)) || existing : existing;

  const applied = officialSnapshot(refreshed);
  const header = buildBulletinHeaderModel(refreshed);
  const complete = headerComplete(header);

  console.log('\nFields applied (current DB):');
  for (const key of OFFICIAL_KEYS) {
    console.log(`  ${key}: ${applied[key] ? 'set' : 'NULL'}`);
  }
  console.log(`  secondaryLogoUrl: ${applied.secondaryLogoUrl ? 'set' : 'NULL'}`);

  console.log('\nBulletin header (schoolOfficialIdentity):');
  console.log(`  displayName: ${header.displayName ? 'ok' : 'MISSING'}`);
  console.log(`  agrementLine: ${header.agrementLine ? 'ok' : 'MISSING'}`);
  console.log(`  educationLevels: ${header.educationLevels ? 'ok' : 'MISSING'}`);
  console.log(`  contactRow: ${header.contactRow ? 'ok' : 'MISSING'}`);
  console.log(`  dren: ${header.dren ? 'ok' : 'MISSING'}`);
  console.log(`  directorName: ${header.directorName ? 'ok' : 'MISSING'}`);
  console.log(`  full header: ${complete ? 'yes' : 'no'}`);

  await pool.end();
  if (!complete) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
