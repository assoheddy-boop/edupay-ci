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

if (!url) {
  console.error('Aucune URL de base en ligne trouvée (.env.vercel-backup / neonctl).');
  process.exit(1);
}

process.env.DATABASE_URL = url;

console.log('Mise en ligne des écoles partenaires (hors EPV)…');

const env = { ...process.env, DATABASE_URL: url, NODE_OPTIONS: '--use-system-ca' };
const onboard = spawnSync('node', ['scripts/onboard-extra-schools.js'], {
  env,
  stdio: 'inherit',
  shell: true,
});
process.exit(onboard.status || 0);
