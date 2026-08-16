jest.mock('../src/config/database', () => ({
  user: { findUnique: jest.fn(), create: jest.fn() },
}));

jest.mock('../src/utils/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
  comparePassword: jest.fn(),
}));

jest.mock('../src/utils/jwt', () => ({
  verifyToken: jest.fn(),
  signToken: jest.fn(),
}));

jest.mock('../src/middleware/auth', () => ({
  issueAuthSession: jest.fn(),
  destroyAuthSession: jest.fn(),
  tryRefreshSession: jest.fn(),
  clearAuthCookie: jest.fn(),
}));

jest.mock('../src/utils/schoolCode', () => ({
  generateUniqueSchoolSlug: jest.fn(),
  findSchoolByCode: jest.fn(),
}));

jest.mock('../src/utils/audit', () => ({
  logAudit: jest.fn(),
}));

jest.mock('../services/HRService', () => ({
  createTeacherProfile: jest.fn(),
}));

const prisma = require('../src/config/database');
const { findSchoolByCode } = require('../src/utils/schoolCode');
const { createTeacherProfile } = require('../services/HRService');
const { register } = require('../src/controllers/authController');

describe('public school register flag', () => {
  const prev = process.env.ALLOW_PUBLIC_SCHOOL_REGISTER;
  const prevTeacher = process.env.ALLOW_PUBLIC_TEACHER_REGISTER;
  const prevEnv = process.env.NODE_ENV;

  afterEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = prevEnv;
    if (prev === undefined) delete process.env.ALLOW_PUBLIC_SCHOOL_REGISTER;
    else process.env.ALLOW_PUBLIC_SCHOOL_REGISTER = prev;
    if (prevTeacher === undefined) delete process.env.ALLOW_PUBLIC_TEACHER_REGISTER;
    else process.env.ALLOW_PUBLIC_TEACHER_REGISTER = prevTeacher;
  });

  test('blocks SCHOOL_ADMIN signup when ALLOW_PUBLIC_SCHOOL_REGISTER=false', async () => {
    process.env.ALLOW_PUBLIC_SCHOOL_REGISTER = 'false';
    prisma.user.findUnique.mockResolvedValue(null);
    const req = {
      body: {
        email: 'new@school.ci',
        password: 'secret12',
        firstName: 'Awa',
        lastName: 'Kone',
        role: 'SCHOOL_ADMIN',
        schoolName: 'EPV Test',
      },
    };
    const res = { render: jest.fn(), redirect: jest.fn() };

    await register(req, res);

    expect(res.render).toHaveBeenCalledWith(
      'auth/register',
      expect.objectContaining({ error: expect.stringMatching(/fermées/) }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test('blocks SCHOOL_ADMIN signup in production by default', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_PUBLIC_SCHOOL_REGISTER;
    prisma.user.findUnique.mockResolvedValue(null);
    const res = { render: jest.fn(), redirect: jest.fn() };
    await register({
      body: {
        email: 'new@school.ci',
        password: 'secret12',
        firstName: 'Awa',
        lastName: 'Kone',
        role: 'SCHOOL_ADMIN',
        schoolName: 'EPV Test',
      },
    }, res);
    expect(res.render).toHaveBeenCalledWith(
      'auth/register',
      expect.objectContaining({ error: expect.stringMatching(/fermées/) }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test('blocks TEACHER self-signup in production by default', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_PUBLIC_TEACHER_REGISTER;
    prisma.user.findUnique.mockResolvedValue(null);
    const res = { render: jest.fn(), redirect: jest.fn() };
    await register({
      body: {
        email: 'prof@new.ci',
        password: 'secret12',
        firstName: 'Awa',
        lastName: 'Kone',
        role: 'TEACHER',
        schoolCode: 'ecole-les-etoiles',
      },
    }, res);
    expect(res.render).toHaveBeenCalledWith(
      'auth/register',
      expect.objectContaining({ error: expect.stringMatching(/invitation/) }),
    );
    expect(findSchoolByCode).not.toHaveBeenCalled();
    expect(createTeacherProfile).not.toHaveBeenCalled();
  });
});
