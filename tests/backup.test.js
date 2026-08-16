jest.mock('../services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const logger = require('../services/logger');
const { dailyDatabaseBackup, parseDatabaseUrl, redactDbUrl, createNeonSnapshot } = require('../services/BackupService');

describe('BackupService', () => {
  const originalUrl = process.env.DATABASE_URL;
  const neonKeys = ['NEON_API_KEY', 'NEON_PROJECT_ID', 'NEON_BRANCH_ID', 'VERCEL'];
  const neonPrev = {};

  beforeEach(() => {
    for (const key of neonKeys) {
      neonPrev[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    for (const key of neonKeys) {
      if (neonPrev[key] === undefined) delete process.env[key];
      else process.env[key] = neonPrev[key];
    }
    jest.clearAllMocks();
    if (global.fetch?.mockRestore) global.fetch.mockRestore();
  });

  test('redactDbUrl strips connection strings', () => {
    const raw = 'failed postgres://user:secret@db.example:5432/edupay_ci extra';
    expect(redactDbUrl(raw)).toBe('failed postgres://*** extra');
    expect(redactDbUrl(raw)).not.toMatch(/secret/);
  });

  test('parseDatabaseUrl extracts fields without exposing them in errors', () => {
    const parsed = parseDatabaseUrl('postgresql://postgres:s3cret@localhost:5432/edupay_ci?sslmode=require');
    expect(parsed).toMatchObject({
      host: 'localhost',
      port: '5432',
      user: 'postgres',
      database: 'edupay_ci',
      sslmode: 'require',
    });
  });

  test('skips when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL;
    const result = await dailyDatabaseBackup();
    expect(result).toEqual({ skipped: true, reason: 'no_database_url' });
    expect(logger.warn).toHaveBeenCalledWith('backup skipped', { reason: 'no_database_url' });
  });

  test('skips when pg_dump is missing', async () => {
    process.env.DATABASE_URL = 'postgresql://postgres:x@localhost:5432/edupay_ci';
    process.env.PG_DUMP_PATH = 'C:\\definitely-missing-pg-dump.exe';
    const result = await dailyDatabaseBackup();
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no_pg_dump');
    delete process.env.PG_DUMP_PATH;
  });

  test('createNeonSnapshot is a no-op without credentials', async () => {
    await expect(createNeonSnapshot()).resolves.toBeNull();
  });

  test('creates a Neon snapshot when API credentials are set', async () => {
    process.env.NEON_API_KEY = 'neon-key';
    process.env.NEON_PROJECT_ID = 'ancient-cloud-90631299';
    process.env.NEON_BRANCH_ID = 'br-main';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ snapshot: { id: 'snap-1' } }),
      text: async () => '',
    });

    const result = await dailyDatabaseBackup();
    expect(result).toEqual({
      ok: true,
      driver: 'neon',
      snapshotId: 'snap-1',
      name: expect.stringMatching(/^educonnect-/),
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining('/snapshot') }),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('skips pg_dump on Vercel when Neon API is not configured', async () => {
    process.env.VERCEL = '1';
    process.env.DATABASE_URL = 'postgresql://postgres:x@localhost:5432/edupay_ci';
    const result = await dailyDatabaseBackup();
    expect(result).toEqual({ skipped: true, reason: 'neon_pitr' });
  });
});
