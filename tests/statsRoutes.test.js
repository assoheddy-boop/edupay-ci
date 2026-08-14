const request = require('supertest');
const app = require('../src/app');

describe('GET /stats', () => {
  test('unauthenticated class stats returns 401 or redirects to login', async () => {
    const res = await request(app).get('/stats/class/demo-class-id');
    expect([401, 302]).toContain(res.status);
    if (res.status === 302) {
      expect(res.headers.location).toMatch(/\/auth\/login/);
    } else {
      expect(res.body.error).toMatch(/authentifi/i);
    }
  });

  test('unauthenticated school stats returns 401 or redirects to login', async () => {
    const res = await request(app)
      .get('/stats/school/demo-school-id')
      .set('Accept', 'application/json');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authentifi/i);
  });

  test('unauthenticated group stats returns 401 or redirects to login', async () => {
    const res = await request(app)
      .get('/stats/group/demo-group-id')
      .set('Accept', 'application/json');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authentifi/i);
  });
});
