jest.mock('../src/config/database', () => ({
  absence: { findMany: jest.fn() },
  grade: { findMany: jest.fn() },
  healthIncident: { findMany: jest.fn() },
  student: { findMany: jest.fn() },
  group: { findUnique: jest.fn() },
}));

jest.mock('../services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const prisma = require('../src/config/database');
const {
  getAbsenceStats,
  getSuccessRate,
  getHealthStats,
  getClassGenderStats,
  getSchoolGenderStats,
  getGroupGenderStats,
} = require('../services/StatsService');

function student(overrides = {}) {
  return {
    id: 'st-1',
    firstName: 'Awa',
    lastName: 'Kouassi',
    classId: 'class-1',
    schoolId: 'school-1',
    class: { id: 'class-1', name: 'CE1 A', level: 'CE1' },
    school: { id: 'school-1', name: 'EPV ECEME' },
    ...overrides,
  };
}

describe('StatsService.getAbsenceStats', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns empty totals when no absences', async () => {
    prisma.absence.findMany.mockResolvedValue([]);
    const result = await getAbsenceStats({ schoolId: 'school-1' });
    expect(result.ok).toBe(true);
    expect(result.total).toBe(0);
    expect(result.byClass).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  test('groups absences by type and class', async () => {
    prisma.absence.findMany.mockResolvedValue([
      { id: 'a1', date: new Date('2026-01-10'), type: 'ABSENCE', reason: 'Malade', studentId: 'st-1', student: student() },
      { id: 'a2', date: new Date('2026-01-11'), type: 'LATE', reason: null, studentId: 'st-1', student: student() },
      {
        id: 'a3',
        date: new Date('2026-01-12'),
        type: 'ABSENCE',
        reason: '',
        studentId: 'st-2',
        student: student({
          id: 'st-2',
          firstName: 'Yao',
          lastName: 'Traoré',
          classId: 'class-2',
          class: { id: 'class-2', name: 'CE2 B', level: 'CE2' },
        }),
      },
    ]);

    const result = await getAbsenceStats({ schoolId: 'school-1', classId: 'class-1' });
    expect(result.ok).toBe(true);
    expect(result.total).toBe(3);
    expect(result.byType).toEqual({ ABSENCE: 2, LATE: 1 });
    expect(result.byClass).toEqual(expect.arrayContaining([
      expect.objectContaining({ className: 'CE1 A', absences: 1, lates: 1, total: 2 }),
      expect.objectContaining({ className: 'CE2 B', absences: 1, lates: 0, total: 1 }),
    ]));
    expect(prisma.absence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { student: { schoolId: 'school-1', classId: 'class-1' } },
    }));
  });
});

describe('StatsService.getSuccessRate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('computes value/maxValue averages and pass rate', async () => {
    prisma.grade.findMany.mockResolvedValue([
      { id: 'g1', subject: 'Maths', value: 14, maxValue: 20, period: 'T1', studentId: 'st-1', student: student() },
      { id: 'g2', subject: 'Maths', value: 8, maxValue: 20, period: 'T1', studentId: 'st-1', student: student() },
      {
        id: 'g3',
        subject: 'Français',
        value: 10,
        maxValue: 20,
        period: 'T1',
        studentId: 'st-2',
        student: student({
          classId: 'class-2',
          class: { id: 'class-2', name: 'CE2 B', level: 'CE2' },
        }),
      },
    ]);

    const result = await getSuccessRate({ schoolId: 'school-1' });
    expect(result.ok).toBe(true);
    expect(result.total).toBe(3);
    expect(result.passing).toBe(2);
    expect(result.successRate).toBe(0.67);
    expect(result.averageOn20).toBe(10.67);
    expect(result.bySubject).toEqual(expect.arrayContaining([
      expect.objectContaining({ subject: 'Maths', count: 2, averageOn20: 11, successRate: 0.5 }),
      expect.objectContaining({ subject: 'Français', count: 1, averageOn20: 10, successRate: 1 }),
    ]));
    expect(result.rows[0].ratio).toBe(0.7);
  });

  test('returns zeros when there are no grades', async () => {
    prisma.grade.findMany.mockResolvedValue([]);
    const result = await getSuccessRate();
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      total: 0,
      passing: 0,
      averageRatio: 0,
      averageOn20: 0,
      successRate: 0,
      byClass: [],
      bySubject: [],
    }));
  });
});

describe('StatsService.getHealthStats', () => {
  beforeEach(() => jest.clearAllMocks());

  test('groups health incidents by type and class', async () => {
    prisma.healthIncident.findMany.mockResolvedValue([
      { id: 'h1', type: 'FIEVRE', description: '38.5', createdAt: new Date(), studentId: 'st-1', student: student() },
      { id: 'h2', type: 'FIEVRE', description: '39', createdAt: new Date(), studentId: 'st-1', student: student() },
      {
        id: 'h3',
        type: 'BLESSURE',
        description: 'Genou',
        createdAt: new Date(),
        studentId: 'st-2',
        student: student({
          classId: 'class-2',
          class: { id: 'class-2', name: 'CE2 B', level: 'CE2' },
        }),
      },
    ]);

    const result = await getHealthStats({ schoolId: 'school-1', from: '2026-01-01', to: '2026-12-31' });
    expect(result.ok).toBe(true);
    expect(result.total).toBe(3);
    expect(result.byType).toEqual({ FIEVRE: 2, BLESSURE: 1 });
    expect(result.byClass.find((c) => c.className === 'CE1 A').total).toBe(2);
    expect(prisma.healthIncident.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        student: { schoolId: 'school-1' },
        createdAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
      }),
    }));
  });
});

describe('StatsService.getClassGenderStats', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns zeros when classId is missing', async () => {
    const result = await getClassGenderStats();
    expect(result).toEqual({ boys: 0, girls: 0, total: 0 });
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  test('counts boys, girls, and total for a class', async () => {
    prisma.student.findMany.mockResolvedValue([
      { id: '1', gender: 'M', absences: [], grades: [] },
      { id: '2', gender: 'F', absences: [], grades: [] },
      { id: '3', gender: null, absences: [], grades: [] },
    ]);

    const result = await getClassGenderStats('class-1');
    expect(result).toEqual({ boys: 1, girls: 1, total: 3 });
    expect(prisma.student.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { classId: 'class-1' },
    }));
  });
});

describe('StatsService.getSchoolGenderStats', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns zeros when schoolId is missing', async () => {
    const result = await getSchoolGenderStats();
    expect(result).toEqual({ boys: 0, girls: 0, total: 0 });
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  test('aggregates gender counts across all students in a school', async () => {
    prisma.student.findMany.mockResolvedValue([
      { gender: 'M' },
      { gender: 'M' },
      { gender: 'F' },
      { gender: null },
    ]);

    const result = await getSchoolGenderStats('school-1');
    expect(result).toEqual({ boys: 2, girls: 1, total: 4 });
    expect(prisma.student.findMany).toHaveBeenCalledWith({
      where: { schoolId: 'school-1' },
      select: { gender: true },
    });
  });
});

describe('StatsService.getGroupGenderStats', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns zeros when groupId is missing', async () => {
    const result = await getGroupGenderStats();
    expect(result).toEqual({ boys: 0, girls: 0, total: 0 });
    expect(prisma.group.findUnique).not.toHaveBeenCalled();
  });

  test('aggregates students from schools linked to the group', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 'group-1',
      schools: [{ id: 'school-1' }, { id: 'school-2' }],
      organization: null,
    });
    prisma.student.findMany.mockResolvedValue([
      { gender: 'M' },
      { gender: 'F' },
      { gender: 'F' },
    ]);

    const result = await getGroupGenderStats('group-1');
    expect(result).toEqual({ boys: 1, girls: 2, total: 3 });
    expect(prisma.student.findMany).toHaveBeenCalledWith({
      where: { schoolId: { in: ['school-1', 'school-2'] } },
      select: { gender: true },
    });
  });

  test('falls back to organization schools when group has no direct schools', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 'group-1',
      schools: [],
      organization: {
        schools: [{ id: 'school-org-1' }],
      },
    });
    prisma.student.findMany.mockResolvedValue([
      { gender: 'M' },
      { gender: null },
    ]);

    const result = await getGroupGenderStats('group-1');
    expect(result).toEqual({ boys: 1, girls: 0, total: 2 });
    expect(prisma.student.findMany).toHaveBeenCalledWith({
      where: { schoolId: { in: ['school-org-1'] } },
      select: { gender: true },
    });
  });
});
