/**
 * Push Prisma schema to Neon production only (.neon-url.tmp).
 * Never reads .env — avoids accidental localhost pushes.
 *   npm run db:push:prod
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const NEON_URL_FILE = '.neon-url.tmp';

function readText(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.slice(2).toString('utf16le');
  }
  return buf.toString('utf8').replace(/^\uFEFF/, '');
}

function postgresUrlFromFile(filePath) {
  return readText(filePath)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^postgres(ql)?:\/\//i.test(line))
    .pop() || '';
}

function maskDb(text) {
  return String(text || '').replace(/postgres(ql)?:\/\/[^\s]+/gi, '[DATABASE_URL]');
}

function describeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '(invalid URL)';
  }
}

function main() {
  const root = path.resolve(__dirname, '..');
  const neonPath = path.join(root, NEON_URL_FILE);

  if (!fs.existsSync(neonPath)) {
    console.error(
      `Missing ${NEON_URL_FILE}. Add a single postgresql:// line (Neon prod), or run scripts/prisma-db-push.js once to fetch it.`,
    );
    process.exit(1);
  }

  const databaseUrl = postgresUrlFromFile(neonPath);
  if (!databaseUrl) {
    console.error(`${NEON_URL_FILE} must contain a postgresql:// connection string.`);
    process.exit(1);
  }

  let hostname;
  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    console.error(`${NEON_URL_FILE} does not contain a valid connection URL.`);
    process.exit(1);
  }

  if (/localhost|127\.0\.0\.1/i.test(hostname)) {
    console.error('Refusing prod push: URL points to localhost. Use npm run db:push for local.');
    process.exit(1);
  }

  if (!/neon\.tech|neon\.build/i.test(hostname)) {
    console.error(
      `Refusing prod push: host "${hostname}" is not a known Neon host. Update ${NEON_URL_FILE} if this is intentional.`,
    );
    process.exit(1);
  }

  console.log(`prisma db push → Neon (${hostname})`);

  const pushArgs = ['prisma', 'db', 'push'];
  if (process.argv.includes('--accept-data-loss')) {
    pushArgs.push('--accept-data-loss');
  }

  const result = spawnSync('npx', pushArgs, {
    encoding: 'utf8',
    shell: true,
    cwd: root,
    env: {
      ...process.env,
      NODE_OPTIONS: '--use-system-ca',
      DATABASE_URL: databaseUrl,
    },
  });

  process.stdout.write(maskDb(`${result.stdout || ''}${result.stderr || ''}`));
  process.exit(result.status ?? 1);
}

main();
