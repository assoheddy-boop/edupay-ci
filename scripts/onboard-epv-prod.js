const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function readText(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
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

const envFile = path.resolve(__dirname, '../.env.vercel-backup');
const parsed = parseEnvFile(envFile);
const neonFile = path.resolve(__dirname, '../.neon-url.tmp');
const neonUrl = fs.existsSync(neonFile)
  ? readText(neonFile).split(/\r?\n/).map((line) => line.trim()).filter((line) => /^postgres(ql)?:\/\//i.test(line)).pop() || ''
  : '';
const url = firstNonEmpty(
  parsed.DATABASE_URL,
  parsed.POSTGRES_PRISMA_URL,
  parsed.POSTGRES_URL,
  parsed.DATABASE_URL_UNPOOLED,
  neonUrl,
);

if (!url) {
  console.error('Aucune URL de base en ligne trouvée dans .env.vercel-backup');
  process.exit(1);
}

process.env.DATABASE_URL = url;
process.env.ONBOARD_TEMP_PASSWORD = process.env.ONBOARD_TEMP_PASSWORD || 'Maquette2026!';

console.log('Mise en ligne des 6 écoles EPV…');

const env = { ...process.env, DATABASE_URL: url };
const push = spawnSync('npx', ['prisma', 'db', 'push'], {
  env,
  stdio: 'inherit',
  shell: true,
});
if (push.status) process.exit(push.status);

const onboard = spawnSync('node', ['scripts/onboard-epv-schools.js'], {
  env,
  stdio: 'inherit',
  shell: true,
});
process.exit(onboard.status || 0);
