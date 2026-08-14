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
  });

  test('GET /metrics exposes prometheus text', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/process_cpu|nodejs_|edupay_/);
  });
});
