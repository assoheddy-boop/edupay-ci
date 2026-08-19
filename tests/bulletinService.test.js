jest.mock('../src/config/database', () => ({
  student: { findFirst: jest.fn(), findMany: jest.fn() },
  grade: { findMany: jest.fn() },
  bulletin: { create: jest.fn() },
  parentStudent: { findMany: jest.fn() },
  notification: { create: jest.fn() },
  subject: { findMany: jest.fn() },
}));

jest.mock('../services/cache', () => ({
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn(),
}));

jest.mock('../src/services/bulletinPdf', () => ({
  generateBulletinPdf: jest.fn().mockResolvedValue({
    pdfUrl: '/uploads/bulletins/test.pdf',
    filename: 'test.pdf',
    filepath: '/tmp/test.pdf',
  }),
}));

const prisma = require('../src/config/database');
const { generateBulletinPdf } = require('../src/services/bulletinPdf');
const { generateBulletinForStudent } = require('../src/services/bulletinService');
const { getCache } = require('../services/cache');

const school = { id: 'school-1', name: 'IGEST', currentSchoolYear: '2025-2026' };

describe('bulletinService weighted bulletin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCache.mockResolvedValue(null);
    prisma.subject.findMany.mockResolvedValue([
      { name: 'Mathématiques', coefficient: 4 },
      { name: 'EPS', coefficient: 1 },
    ]);
    prisma.parentStudent.findMany.mockResolvedValue([]);
    prisma.bulletin.create.mockResolvedValue({ id: 'b1' });
    prisma.student.findFirst.mockResolvedValue({
      id: 'stu-1',
      firstName: 'Awa',
      lastName: 'Kouassi',
      classId: 'class-1',
      schoolId: 'school-1',
      class: { id: 'class-1', name: '6e A', schoolYear: '2025-2026' },
    });
    prisma.student.findMany.mockResolvedValue([{ id: 'stu-1' }]);
  });

  test('uses weighted average, not arithmetic mean', async () => {
    prisma.grade.findMany.mockResolvedValue([
      { subject: 'Mathématiques', value: 16, maxValue: 20, period: 'T1', term: 'T1', studentId: 'stu-1' },
      { subject: 'EPS', value: 10, maxValue: 20, period: 'T1', term: 'T1', studentId: 'stu-1' },
    ]);

    const result = await generateBulletinForStudent({ studentId: 'stu-1', period: 'T1', school });
    expect(result.success).toBe(true);
    expect(result.average).toBe(14.8);
    expect(generateBulletinPdf).toHaveBeenCalledWith(expect.objectContaining({
      average: 14.8,
      period: 'Trimestre 1',
    }));
    expect(prisma.bulletin.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ average: 14.8, period: 'T1' }),
    }));
  });

  test('T1 bulletin ignores T2 grades, including Trimestre 1 aliases', async () => {
    const allGrades = [
      { subject: 'Mathématiques', value: 8, maxValue: 20, period: 'Trimestre 1', studentId: 'stu-1' },
      { subject: 'Mathématiques', value: 20, maxValue: 20, period: 'T2', term: 'T2', studentId: 'stu-1' },
    ];
    prisma.grade.findMany.mockImplementation(async ({ where }) => {
      if (where?.studentId) return allGrades.filter((g) => g.studentId === where.studentId);
      return allGrades;
    });

    const t1 = await generateBulletinForStudent({ studentId: 'stu-1', period: 'T1', school });
    const t2 = await generateBulletinForStudent({ studentId: 'stu-1', period: 'T2', school });
    expect(t1.average).toBe(8);
    expect(t2.average).toBe(20);
    expect(generateBulletinPdf.mock.calls[0][0].grades).toHaveLength(1);
    expect(generateBulletinPdf.mock.calls[0][0].grades[0].value).toBe(8);
  });

  test('returns notes error when the term has no grades', async () => {
    prisma.grade.findMany.mockResolvedValue([
      { subject: 'Mathématiques', value: 12, maxValue: 20, period: 'T2', term: 'T2', studentId: 'stu-1' },
    ]);
    const result = await generateBulletinForStudent({ studentId: 'stu-1', period: 'T1', school });
    expect(result).toEqual({ error: 'notes' });
    expect(generateBulletinPdf).not.toHaveBeenCalled();
  });
});
