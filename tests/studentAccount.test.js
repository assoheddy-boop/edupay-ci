const { createStudentUserAccount } = require('../src/utils/studentAccount');

jest.mock('../src/config/database', () => ({
  student: {
    findUnique: jest.fn(),
  },
  user: { findUnique: jest.fn(), create: jest.fn() },
}));

jest.mock('../src/utils/password', () => ({
  hashPassword: jest.fn(async (p) => `hash:${p}`),
}));

jest.mock('../src/utils/audit', () => ({
  logAudit: jest.fn(),
}));

const prisma = require('../src/config/database');

describe('student account utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createStudentUserAccount rejects already linked student', async () => {
    prisma.student.findUnique.mockResolvedValue({
      id: 'st-1',
      firstName: 'Awa',
      lastName: 'Kouassi',
      user: { id: 'u-existing' },
      class: { school: { id: 'sch-1' } },
    });

    const result = await createStudentUserAccount({
      email: 'awa@test.ci',
      password: 'secret',
      studentId: 'st-1',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('linked');
  });

  test('createStudentUserAccount creates STUDENT user', async () => {
    prisma.student.findUnique.mockResolvedValue({
      id: 'st-2',
      firstName: 'Kofi',
      lastName: 'Yao',
      schoolId: 'sch-1',
      user: null,
      class: { school: { id: 'sch-1', name: 'Demo' } },
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u-student',
      email: 'kofi@test.ci',
      role: 'STUDENT',
      studentId: 'st-2',
    });

    const result = await createStudentUserAccount({
      email: 'kofi@test.ci',
      password: 'demo1234',
      studentId: 'st-2',
    });

    expect(result.ok).toBe(true);
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        role: 'STUDENT',
        studentId: 'st-2',
        email: 'kofi@test.ci',
      }),
    }));
  });
});
