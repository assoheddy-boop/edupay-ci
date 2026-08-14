jest.mock('../src/config/database', () => ({
  student: { findMany: jest.fn() },
  class: { findMany: jest.fn() },
}));

jest.mock('../services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const prisma = require('../src/config/database');
const {
  getClassGenderStats,
  getGenderStatsBySchool,
  parseGender,
  assertGender,
} = require('../services/ClassService');

describe('ClassService.parseGender / assertGender', () => {
  test('accepts M and F, empty as null', () => {
    expect(parseGender('M')).toBe('M');
    expect(parseGender('f')).toBe('F');
    expect(parseGender('')).toBeNull();
    expect(parseGender('X')).toBeNull();
  });

  test('rejects values other than M/F', () => {
    expect(assertGender('X')).toEqual({ ok: false, error: 'gender' });
    expect(assertGender('M')).toEqual({ ok: true, gender: 'M' });
    expect(assertGender('')).toEqual({ ok: true, gender: null });
  });
});

describe('ClassService.getClassGenderStats', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns zeros when classId is missing', async () => {
    const result = await getClassGenderStats();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('class');
    expect(result.boys).toBe(0);
    expect(result.girls).toBe(0);
    expect(result.total).toBe(0);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  test('counts M/F and includes unknown gender in total', async () => {
    prisma.student.findMany.mockResolvedValue([
      { id: '1', gender: 'M', absences: [{ id: 'a1' }, { id: 'a2' }], grades: [{ value: 14, maxValue: 20 }] },
      { id: '2', gender: 'F', absences: [{ id: 'a3' }], grades: [{ value: 8, maxValue: 20 }] },
      { id: '3', gender: null, absences: [{ id: 'a4' }], grades: [{ value: 20, maxValue: 20 }] },
      { id: '4', gender: 'F', absences: [], grades: [{ value: 16, maxValue: 20 }] },
    ]);

    const result = await getClassGenderStats('class-1');
    expect(result.ok).toBe(true);
    expect(result.boys).toBe(1);
    expect(result.girls).toBe(2);
    expect(result.total).toBe(4);
    expect(result.unknown).toBe(1);
    expect(result.absences).toEqual({ boys: 2, girls: 1 });
    expect(result.success.boys.successRate).toBe(1);
    expect(result.success.girls.successRate).toBe(0.5);
    expect(prisma.student.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { classId: 'class-1' },
    }));
  });

  test('returns empty counts when the class has no students', async () => {
    prisma.student.findMany.mockResolvedValue([]);
    const result = await getClassGenderStats('class-empty');
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      boys: 0,
      girls: 0,
      total: 0,
      unknown: 0,
      absences: { boys: 0, girls: 0 },
    }));
  });
});

describe('ClassService.getGenderStatsBySchool', () => {
  beforeEach(() => jest.clearAllMocks());

  test('groups boys/girls/total per school', async () => {
    prisma.student.findMany.mockResolvedValue([
      { gender: 'M', schoolId: 's1', school: { id: 's1', name: 'Étoile' }, absences: [], grades: [] },
      { gender: 'F', schoolId: 's1', school: { id: 's1', name: 'Étoile' }, absences: [], grades: [] },
      { gender: 'F', schoolId: 's2', school: { id: 's2', name: 'Horizon' }, absences: [], grades: [] },
      { gender: null, schoolId: 's2', school: { id: 's2', name: 'Horizon' }, absences: [], grades: [] },
    ]);

    const result = await getGenderStatsBySchool();
    expect(result.ok).toBe(true);
    expect(result.schools).toEqual(expect.arrayContaining([
      expect.objectContaining({ schoolName: 'Étoile', boys: 1, girls: 1, total: 2 }),
      expect.objectContaining({ schoolName: 'Horizon', boys: 0, girls: 1, total: 2 }),
    ]));
  });
});
