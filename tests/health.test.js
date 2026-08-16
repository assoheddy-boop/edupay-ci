const request = require('supertest');
const app = require('../src/app');

describe('EduPay CI API', () => {
  test('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('GET / returns 200', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Demander une démo/);
    expect(res.text).toMatch(/bien plus qu.un paiement scolaire/);
  });

  test('GET /metrics exposes prometheus text', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/process_cpu|nodejs_|edupay_/);
  });

  test('GET /metrics is closed in production without METRICS_BEARER', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevBearer = process.env.METRICS_BEARER;
    process.env.NODE_ENV = 'production';
    delete process.env.METRICS_BEARER;
    const res = await request(app).get('/metrics');
    process.env.NODE_ENV = prevEnv;
    if (prevBearer === undefined) delete process.env.METRICS_BEARER;
    else process.env.METRICS_BEARER = prevBearer;
    expect(res.status).toBe(403);
  });

  test('hides demo accounts on landing in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = await request(app).get('/');
    process.env.NODE_ENV = prev;
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/demo1234/);
  });
});
