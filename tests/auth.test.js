const request = require('supertest');
const app = require('../src/app');

describe('Auth flows', () => {
  test('GET /auth/login returns 200', async () => {
    const res = await request(app).get('/auth/login');
    expect(res.status).toBe(200);
  });

  test('GET /auth/register returns 200', async () => {
    const res = await request(app).get('/auth/register?role=PARENT');
    expect(res.status).toBe(200);
  });

  test('POST /auth/login rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .type('form')
      .send({ email: 'invalid@test.ci', password: 'wrong', role: 'parent' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/incorrect/i);
  });

  test('POST /auth/login with demo parent', async () => {
    const res = await request(app)
      .post('/auth/login')
      .type('form')
      .send({ email: 'parent@demo.ci', password: 'demo1234', role: 'parent' });
    expect([200, 302]).toContain(res.status);
    if (res.status === 302) {
      expect(res.headers.location).toMatch(/parent/);
    }
  });
});
