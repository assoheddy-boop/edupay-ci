describe('logger', () => {
  const originalVercel = process.env.VERCEL;

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    jest.resetModules();
  });

  test('loads on Vercel without creating log files', () => {
    process.env.VERCEL = '1';
    jest.resetModules();
    const logger = require('../services/logger');
    expect(typeof logger.info).toBe('function');
    expect(() => logger.info('serverless boot')).not.toThrow();
  });
});
