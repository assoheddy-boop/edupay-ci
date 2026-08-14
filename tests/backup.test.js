jest.mock('../services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const logger = require('../services/logger');
const { dailyDatabaseBackup, parseDatabaseUrl, redactDbUrl } = require('../services/BackupService');

describe('BackupService', () => {
  const originalUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    jest.clearAllMocks();
  });

  test('redactDbUrl strips connection strings', () => {
    const raw = 'failed postgres://user:secret@db.example:5432/edupay extra';
    expect(redactDbUrl(raw)).toBe('failed postgres://*** extra');
    expect(redactDbUrl(raw)).not.toMatch(/secret/);
  });

  test('parseDatabaseUrl extracts fields without exposing them in errors', () => {
    const parsed = parseDatabaseUrl('postgresql://edupay:s3cret@localhost:5432/edupay_ci?sslmode=require');
    expect(parsed).toMatchObject({
      host: 'localhost',
      port: '5432',
      user: 'edupay',
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
    process.env.DATABASE_URL = 'postgresql://edupay:x@localhost:5432/edupay_ci';
    process.env.PG_DUMP_PATH = 'C:\\definitely-missing-pg-dump.exe';
    const result = await dailyDatabaseBackup();
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no_pg_dump');
    delete process.env.PG_DUMP_PATH;
  });
});
