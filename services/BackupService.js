const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const logger = require('./logger');

const BACKUP_DIR = path.join(__dirname, '../backups');
const RETAIN_DAYS = Number(process.env.BACKUP_RETAIN_DAYS) || 7;

function redactDbUrl(value) {
  if (!value) return '';
  return String(value).replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgres://***');
}

function parseDatabaseUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const database = decodeURIComponent(url.pathname.replace(/^\//, '')).split('?')[0];
    if (!url.hostname || !database) return null;
    return {
      host: url.hostname,
      port: url.port || '5432',
      user: decodeURIComponent(url.username || ''),
      password: decodeURIComponent(url.password || ''),
      database,
      sslmode: url.searchParams.get('sslmode') || (/\.neon\.tech$/i.test(url.hostname) ? 'require' : ''),
    };
  } catch {
    return null;
  }
}

function resolvePgDump() {
  if (process.env.PG_DUMP_PATH) {
    return fs.existsSync(process.env.PG_DUMP_PATH) ? process.env.PG_DUMP_PATH : null;
  }
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('where.exe', ['pg_dump'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
      return out || null;
    }
    const out = execFileSync('which', ['pg_dump'], { encoding: 'utf8' }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function pruneOldBackups() {
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
  try {
    for (const name of fs.readdirSync(BACKUP_DIR)) {
      if (!name.startsWith('edupay-') || !name.endsWith('.dump')) continue;
      const full = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(full);
    }
  } catch (err) {
    logger.warn('backup prune failed', { error: err.message });
  }
}

function runPgDump(pgDump, parsed, outfile) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      PGHOST: parsed.host,
      PGPORT: String(parsed.port),
      PGUSER: parsed.user,
      PGPASSWORD: parsed.password,
      PGDATABASE: parsed.database,
    };
    if (parsed.sslmode) env.PGSSLMODE = parsed.sslmode;
    delete env.DATABASE_URL;

    const child = spawn(pgDump, ['-Fc', '--no-owner', '--no-acl', '-f', outfile], {
      env,
      windowsHide: true,
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += redactDbUrl(chunk.toString());
      if (stderr.length > 2000) stderr = stderr.slice(-2000);
    });

    const timer = setTimeout(() => {
      child.kill();
    }, Number(process.env.BACKUP_TIMEOUT_MS) || 10 * 60 * 1000);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: stderr.trim() || `pg_dump exited ${code}` });
    });
  });
}

async function dailyDatabaseBackup() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    logger.warn('backup skipped', { reason: 'no_database_url' });
    return { skipped: true, reason: 'no_database_url' };
  }

  const parsed = parseDatabaseUrl(dbUrl);
  if (!parsed) {
    logger.warn('backup skipped', { reason: 'invalid_database_url' });
    return { skipped: true, reason: 'invalid_database_url' };
  }

  const pgDump = resolvePgDump();
  if (!pgDump) {
    logger.warn('backup skipped', { reason: 'no_pg_dump' });
    return { skipped: true, reason: 'no_pg_dump' };
  }

  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  } catch (err) {
    logger.error('backup failed', { reason: 'mkdir', error: err.message });
    return { ok: false, reason: 'mkdir', error: err.message };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outfile = path.join(BACKUP_DIR, `edupay-${stamp}.dump`);

  const result = await runPgDump(pgDump, parsed, outfile);
  if (!result.ok) {
    logger.error('backup failed', { error: redactDbUrl(result.error) });
    try { if (fs.existsSync(outfile)) fs.unlinkSync(outfile); } catch { /* ignore */ }
    return { ok: false, error: 'pg_dump_failed' };
  }

  pruneOldBackups();
  logger.info('backup completed', { file: path.basename(outfile) });
  return { ok: true, file: path.basename(outfile) };
}

module.exports = {
  BACKUP_DIR,
  dailyDatabaseBackup,
  resolvePgDump,
  parseDatabaseUrl,
  redactDbUrl,
};
