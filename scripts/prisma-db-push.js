/**
 * prisma generate + db push local et Neon.
 * N’imprime jamais DATABASE_URL.
 *   NODE_OPTIONS=--use-system-ca node scripts/prisma-db-push.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function readText(filePath) {
  if (!fs.existsSync(filePath)) return '';
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
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

function isLocalUrl(url) {
  try {
    return /localhost|127\.0\.0\.1/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
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

function run(cmd, args, extraEnv = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, NODE_OPTIONS: '--use-system-ca', ...extraEnv },
  });
  process.stdout.write(maskDb(`${result.stdout || ''}\n${result.stderr || ''}`));
  return result.status || 0;
}

function main() {
  const root = path.resolve(__dirname, '..');
  process.chdir(root);

  console.log('prisma generate');
  const gen = run('npx', ['prisma', 'generate']);
  if (gen) process.exit(gen);

  const localParsed = parseEnvFile(path.join(root, '.env'));
  const localUrl = firstNonEmpty(localParsed.DATABASE_URL, localParsed.POSTGRES_PRISMA_URL, localParsed.POSTGRES_URL);
  const neonParsed = parseEnvFile(path.join(root, '.env.vercel-backup'));
  const neonFile = path.join(root, '.neon-url.tmp');
  let neonUrl = firstNonEmpty(
    neonParsed.DATABASE_URL,
    neonParsed.POSTGRES_PRISMA_URL,
    neonParsed.POSTGRES_URL,
    neonParsed.DATABASE_URL_UNPOOLED,
    neonUrlFromFile(neonFile),
  );
  if (!neonUrl) {
    console.log('Récupération de l’URL Neon (masquée)…');
    neonUrl = fetchNeonUrl();
    if (neonUrl) fs.writeFileSync(neonFile, `${neonUrl}\n`);
  }

  const targets = [];
  if (localUrl) {
    targets.push({
      url: localUrl,
      label: isLocalUrl(localUrl) ? 'PostgreSQL local' : `${describeTarget(localUrl)} (.env)`,
    });
  }
  if (neonUrl && neonUrl !== localUrl) {
    targets.push({ url: neonUrl, label: describeTarget(neonUrl) });
  }
  if (!targets.length) {
    console.error('Aucune DATABASE_URL (local ou Neon).');
    process.exit(1);
  }

  let code = 0;
  for (const target of targets) {
    console.log(`prisma db push → ${target.label}`);
    const pushArgs = ['prisma', 'db', 'push'];
    if (process.argv.includes('--accept-data-loss')) pushArgs.push('--accept-data-loss');
    const status = run('npx', pushArgs, { DATABASE_URL: target.url });
    if (status) code = status;
  }
  process.exit(code);
}

main();
