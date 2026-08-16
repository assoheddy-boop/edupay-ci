jest.mock('../src/config/database', () => ({
  school: { findFirst: jest.fn() },
  student: { findFirst: jest.fn() },
  parentStudent: { findUnique: jest.fn(), create: jest.fn() },
}));

jest.mock('../src/utils/schoolCode', () => ({
  findSchoolByCode: jest.fn(),
}));

jest.mock('../src/utils/audit', () => ({
  logAudit: jest.fn(),
}));

const prisma = require('../src/config/database');
const { findSchoolByCode } = require('../src/utils/schoolCode');
const { addChild } = require('../src/controllers/parentController');

function mockRes() {
  return { redirect: jest.fn() };
}

describe('parent addChild', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects a last name that does not match the student', async () => {
    findSchoolByCode.mockResolvedValue({ id: 'sch-1' });
    prisma.student.findFirst.mockResolvedValue({
      id: 'stu-1',
      lastName: 'Kouassi',
      matricule: 'ETOILE-001',
    });
    const res = mockRes();
    await addChild({
      user: { parentProfile: { id: 'p1' } },
      body: { schoolCode: 'ecole-les-etoiles', matricule: 'ETOILE-001', lastName: 'Traore' },
    }, res);
    expect(res.redirect).toHaveBeenCalledWith('/parent/dashboard?error=nom');
    expect(prisma.parentStudent.create).not.toHaveBeenCalled();
  });

  test('links when matricule and last name match', async () => {
    findSchoolByCode.mockResolvedValue({ id: 'sch-1' });
    prisma.student.findFirst.mockResolvedValue({
      id: 'stu-1',
      lastName: 'Kouassi',
      matricule: 'ETOILE-001',
    });
    prisma.parentStudent.findUnique.mockResolvedValue(null);
    prisma.parentStudent.create.mockResolvedValue({ id: 'link-1' });
    const res = mockRes();
    await addChild({
      user: { parentProfile: { id: 'p1' }, id: 'u1' },
      body: { schoolCode: 'ecole-les-etoiles', matricule: 'ETOILE-001', lastName: 'kouassi' },
      ip: '127.0.0.1',
    }, res);
    expect(prisma.parentStudent.create).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/parent/dashboard?success=1');
  });
});
