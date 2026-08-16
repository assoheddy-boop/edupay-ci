const request = require('supertest');
const app = require('../src/app');
const { safeInternalPath, getCookieOptions } = require('../src/utils/cookies');
const { safeJson } = require('../src/utils/safeJson');
const { isDangerousUpload, blockedUploadPath } = require('../src/utils/uploadSafety');
const { uniqueFilename } = require('../services/StorageService');
const {
  isPublicSchoolRegisterOpen,
  isPublicTeacherRegisterOpen,
} = require('../src/utils/registerFlags');

describe('production hardening helpers', () => {
  test('safeInternalPath rejects protocol-relative and off-site URLs', () => {
    expect(safeInternalPath('/parent/dashboard', '/')).toBe('/parent/dashboard');
    expect(safeInternalPath('//evil.com', '/ok')).toBe('/ok');
    expect(safeInternalPath('https://evil.com/', '/ok')).toBe('/ok');
    expect(safeInternalPath('\\evil', '/ok')).toBe('/ok');
    expect(safeInternalPath('javascript:alert(1)', '/ok')).toBe('/ok');
  });

  test('safeJson escapes script breakout', () => {
    const json = safeJson({ x: '</script><script>alert(1)' });
    expect(json).not.toMatch(/</);
    expect(json).toContain('\\u003c');
  });

  test('rejects SVG / HTML uploads', () => {
    expect(isDangerousUpload({ originalname: 'logo.svg', mimetype: 'image/svg+xml' })).toBe(true);
    expect(isDangerousUpload({ originalname: 'x.html', mimetype: 'text/html' })).toBe(true);
    expect(isDangerousUpload({ originalname: 'ok.jpg', mimetype: 'image/jpeg' })).toBe(false);
  });

  test('blocks dangerous /uploads extensions', () => {
    expect(blockedUploadPath('/x.svg')).toBe(true);
    expect(blockedUploadPath('/chat/a.html')).toBe(true);
    expect(blockedUploadPath('/payments/a.jpg')).toBe(false);
  });

  test('uniqueFilename strips .svg extension', () => {
    expect(uniqueFilename('payload.svg')).not.toMatch(/\.svg$/i);
    expect(uniqueFilename('ok.png')).toMatch(/\.png$/);
  });

  test('public school/teacher register is closed in production unless explicitly enabled', () => {
    const prev = process.env.NODE_ENV;
    const prevSchool = process.env.ALLOW_PUBLIC_SCHOOL_REGISTER;
    const prevTeacher = process.env.ALLOW_PUBLIC_TEACHER_REGISTER;
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_PUBLIC_SCHOOL_REGISTER;
    delete process.env.ALLOW_PUBLIC_TEACHER_REGISTER;
    expect(isPublicSchoolRegisterOpen()).toBe(false);
    expect(isPublicTeacherRegisterOpen()).toBe(false);
    process.env.ALLOW_PUBLIC_SCHOOL_REGISTER = 'true';
    expect(isPublicSchoolRegisterOpen()).toBe(true);
    process.env.NODE_ENV = prev;
    if (prevSchool === undefined) delete process.env.ALLOW_PUBLIC_SCHOOL_REGISTER;
    else process.env.ALLOW_PUBLIC_SCHOOL_REGISTER = prevSchool;
    if (prevTeacher === undefined) delete process.env.ALLOW_PUBLIC_TEACHER_REGISTER;
    else process.env.ALLOW_PUBLIC_TEACHER_REGISTER = prevTeacher;
  });

  test('auth cookies stay httpOnly + SameSite=strict + secure in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const opts = getCookieOptions();
    process.env.NODE_ENV = prev;
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('strict');
    expect(opts.secure).toBe(true);
  });
});

describe('production HTTP hardening', () => {
  test('sets nosniff and does not leak demo passwords', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = await request(app).get('/auth/login');
    process.env.NODE_ENV = prev;
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.text).not.toMatch(/demo1234/);
  });

  test('does not serve SVG from /uploads', async () => {
    const res = await request(app).get('/uploads/chat/xss.svg');
    expect(res.status).toBe(404);
  });

  test('POST /auth/refresh does not return a JWT in JSON', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .set('Accept', 'application/json');
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });
});

describe('JWT production secret', () => {
  test('refuses the default secret when forced in production', () => {
    jest.resetModules();
    const prevEnv = process.env.NODE_ENV;
    const prevSecret = process.env.JWT_SECRET;
    const prevForce = process.env.FORCE_JWT_PROD_CHECK;
    process.env.NODE_ENV = 'production';
    process.env.FORCE_JWT_PROD_CHECK = '1';
    delete process.env.JWT_SECRET;
    const { assertProductionJwtSecret } = require('../src/utils/jwt');
    expect(() => assertProductionJwtSecret()).toThrow(/JWT_SECRET/);
    process.env.NODE_ENV = prevEnv;
    process.env.FORCE_JWT_PROD_CHECK = prevForce;
    if (prevSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevSecret;
    if (prevForce === undefined) delete process.env.FORCE_JWT_PROD_CHECK;
    jest.resetModules();
  });
});
