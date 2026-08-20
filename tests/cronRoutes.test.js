jest.mock('../src/jobs/cron', () => ({
  paymentReminders: jest.fn().mockResolvedValue(undefined),
  weeklyParentSummary: jest.fn().mockResolvedValue(undefined),
  dailyBackup: jest.fn().mockResolvedValue({ ok: true, driver: 'neon' }),
  homeworkReminders: jest.fn().mockResolvedValue({ ok: true, sent: 0 }),
  notificationJobs: jest.fn().mockResolvedValue({ ok: true, scanned: 0, sent: 0, skipped: 0, failed: 0 }),
  hrLeaveMaintenance: jest.fn().mockResolvedValue({ restored: 0, checked: 0 }),
  marketplaceRenewalReminders: jest.fn().mockResolvedValue({ scanned: 0, sent: 0, skipped: 0, failed: 0 }),
  startCronJobs: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/app');
const { paymentReminders, dailyBackup, homeworkReminders, notificationJobs, marketplaceRenewalReminders } = require('../src/jobs/cron');

describe('internal cron routes', () => {
  const prevEnv = process.env.NODE_ENV;
  const prevSecret = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = prevEnv;
    if (prevSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevSecret;
    jest.clearAllMocks();
  });

  test('closes in production without CRON_SECRET', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CRON_SECRET;
    const res = await request(app).get('/api/internal/cron/payments');
    expect(res.status).toBe(403);
    expect(paymentReminders).not.toHaveBeenCalled();
  });

  test('rejects a wrong bearer token', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const res = await request(app)
      .get('/api/internal/cron/payments')
      .set('Authorization', 'Bearer wrong');
    expect(res.status).toBe(401);
    expect(paymentReminders).not.toHaveBeenCalled();
  });

  test('runs the job when the bearer matches', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const res = await request(app)
      .get('/api/internal/cron/payments')
      .set('Authorization', 'Bearer cron-secret');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, job: 'payments' });
    expect(paymentReminders).toHaveBeenCalled();
  });

  test('runs backup job', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const res = await request(app)
      .get('/api/internal/cron/backup')
      .set('Authorization', 'Bearer cron-secret');
    expect(res.status).toBe(200);
    expect(dailyBackup).toHaveBeenCalled();
    expect(res.body.result).toEqual({ ok: true, driver: 'neon' });
  });

  test('daily job runs payments, homework reminders and backup', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const res = await request(app)
      .get('/api/internal/cron/daily')
      .set('Authorization', 'Bearer cron-secret');
    expect(res.status).toBe(200);
    expect(res.body.job).toBe('daily');
    expect(paymentReminders).toHaveBeenCalled();
    expect(homeworkReminders).toHaveBeenCalled();
    expect(dailyBackup).toHaveBeenCalled();
  });

  test('dedicated homework-reminders route runs the job', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const res = await request(app)
      .get('/api/internal/cron/homework-reminders')
      .set('Authorization', 'Bearer cron-secret');
    expect(res.status).toBe(200);
    expect(res.body.job).toBe('homework-reminders');
    expect(homeworkReminders).toHaveBeenCalled();
  });

  test('closes on Vercel without CRON_SECRET', async () => {
    const prevVercel = process.env.VERCEL;
    process.env.VERCEL = '1';
    delete process.env.CRON_SECRET;
    const res = await request(app).get('/api/internal/cron/payments');
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    expect(res.status).toBe(403);
    expect(paymentReminders).not.toHaveBeenCalled();
  });

  test('closes notifications cron without a matching secret', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const res = await request(app).get('/api/internal/cron/notifications');
    expect(res.status).toBe(401);
    expect(notificationJobs).not.toHaveBeenCalled();
  });

  test('dedicated notifications route runs the worker', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const res = await request(app)
      .get('/api/internal/cron/notifications')
      .set('Authorization', 'Bearer cron-secret');
    expect(res.status).toBe(200);
    expect(res.body.job).toBe('notifications');
    expect(notificationJobs).toHaveBeenCalled();
  });

  test('dedicated marketplace-renewals route runs the job', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const res = await request(app)
      .get('/api/internal/cron/marketplace-renewals')
      .set('Authorization', 'Bearer cron-secret');
    expect(res.status).toBe(200);
    expect(res.body.job).toBe('marketplace-renewals');
    expect(marketplaceRenewalReminders).toHaveBeenCalled();
  });

  test('daily job also drains the notification queue', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const res = await request(app)
      .get('/api/internal/cron/daily')
      .set('Authorization', 'Bearer cron-secret');
    expect(res.status).toBe(200);
    expect(notificationJobs).toHaveBeenCalled();
    expect(res.body.result.notifications).toMatchObject({ ok: true });
  });
});
