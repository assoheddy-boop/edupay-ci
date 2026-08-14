const request = require('supertest');
const app = require('../src/app');
const { checkRole } = require('../src/middleware/auth');
const { getCookieOptions } = require('../src/utils/cookies');

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

  test('POST /auth/refresh without token is rejected', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .set('Accept', 'application/json');
    expect(res.status).toBe(401);
  });
});

describe('JWT cookie options', () => {
  test('cookie is httpOnly with sameSite strict', () => {
    const opts = getCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('strict');
    expect(opts.secure).toBe(process.env.NODE_ENV === 'production');
  });
});

describe('checkRole', () => {
  function mockRes() {
    return {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      send(text) { this.body = text; return this; },
    };
  }

  test('allows matching school admin', () => {
    const req = { user: { role: 'SCHOOL_ADMIN' } };
    const res = mockRes();
    const next = jest.fn();
    checkRole('school')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 403 Forbidden for the wrong role', () => {
    const req = { user: { role: 'PARENT' } };
    const res = mockRes();
    const next = jest.fn();
    checkRole('school')(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body).toBe('Forbidden');
    expect(next).not.toHaveBeenCalled();
  });
});

