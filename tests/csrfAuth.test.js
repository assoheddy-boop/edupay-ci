const request = require('supertest');
const { csrfProtection } = require('../src/middleware/csrfProtection');
const { ensureCsrfToken, requireCsrf, createCsrfToken, csrfTokensMatch } = require('../src/utils/csrf');

function mockRes() {
  const res = {
    locals: {},
    cookies: {},
    statusCode: 200,
    body: null,
    cookie(name, value) {
      this.cookies[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    render(view, data) {
      this.body = { view, data };
      return this;
    },
  };
  return res;
}

describe('csrf utils', () => {
  test('tokens must match exactly', () => {
    const a = createCsrfToken();
    const b = createCsrfToken();
    expect(csrfTokensMatch(a, a)).toBe(true);
    expect(csrfTokensMatch(a, b)).toBe(false);
  });

  test('requireCsrf rejects missing token', () => {
    const req = { body: {}, cookies: {}, headers: {}, originalUrl: '/parent/x', accepts: () => 'html' };
    const res = mockRes();
    let nextCalled = false;
    requireCsrf(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  test('requireCsrf accepts matching body token', () => {
    const token = createCsrfToken();
    const req = {
      body: { _csrf: token },
      cookies: { edu_csrf: token },
      headers: {},
      originalUrl: '/parent/x',
      accepts: () => 'html',
    };
    const res = mockRes();
    let nextCalled = false;
    requireCsrf(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  test('requireCsrf accepts X-CSRF-Token header', () => {
    const token = createCsrfToken();
    const req = {
      body: {},
      cookies: { edu_csrf: token },
      headers: { 'x-csrf-token': token },
      originalUrl: '/school/x',
      accepts: () => 'json',
    };
    const res = mockRes();
    let nextCalled = false;
    requireCsrf(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});

describe('csrfProtection middleware', () => {
  test('skips GET requests', () => {
    const req = { method: 'GET', headers: {}, originalUrl: '/parent/dashboard' };
    const res = mockRes();
    let nextCalled = false;
    csrfProtection(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  test('skips Bearer API requests', () => {
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer ey.test' },
      originalUrl: '/api/v1/sync',
      cookies: {},
      body: {},
    };
    const res = mockRes();
    let nextCalled = false;
    csrfProtection(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  test('blocks POST without token on cookie-auth routes', () => {
    const token = createCsrfToken();
    const req = {
      method: 'POST',
      headers: {},
      originalUrl: '/parent/select-school',
      cookies: { edu_csrf: token },
      body: { schoolId: 'sch-1' },
      accepts: () => 'html',
    };
    const res = mockRes();
    let nextCalled = false;
    csrfProtection(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});

describe('ensureCsrfToken on devis route', () => {
  test('GET /devis sets edu_csrf cookie', async () => {
    const app = require('../src/app');
    const res = await request(app).get('/devis');
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']?.join(';')).toMatch(/edu_csrf=|devis_csrf=/);
  });
});
