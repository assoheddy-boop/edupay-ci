const { setCache, getCache, delCache } = require('../services/cache');
const logger = require('../services/logger');

describe('cache', () => {
  test('setCache then getCache returns the value', async () => {
    await setCache('unit:stats', { students: 12, avg: 14.5 }, 60);
    await expect(getCache('unit:stats')).resolves.toEqual({ students: 12, avg: 14.5 });
  });

  test('getCache returns null for unknown key', async () => {
    await expect(getCache('unit:missing-key')).resolves.toBeNull();
  });

  test('delCache removes the key', async () => {
    await setCache('unit:bulletin', { pdfUrl: '/uploads/bulletins/a.pdf' }, 60);
    await delCache('unit:bulletin');
    await expect(getCache('unit:bulletin')).resolves.toBeNull();
  });
});

describe('logger', () => {
  test('exposes info, warn and error', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});
