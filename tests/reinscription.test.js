jest.mock('../src/config/database', () => ({
  student: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  class: { findFirst: jest.fn(), findMany: jest.fn() },
  studentYearRecord: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  absence: { findMany: jest.fn() },
  grade: { findMany: jest.fn() },
  group: { findUnique: jest.fn() },
  $transaction: jest.fn(),
}));

jest.mock('../services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const prisma = require('../src/config/database');
const {
  reEnrollStudent,
  getReinscriptionStats,
  studentValidatedYear,
  listReinscriptionRows,
  analyzeRedoublementCauses,
  determineCause,
  getRedoublementCauseStats,
  getGroupRedoublementCauses,
  AT_RISK_REPEAT_RATE,
  ABSENCE_THRESHOLD,
  GRADE_THRESHOLD,
} = require('../services/ReinscriptionService');

describe('ReinscriptionService.studentValidatedYear', () => {
  test('returns false when no grades', () => {
    expect(studentValidatedYear([])).toBe(false);
    expect(studentValidatedYear(null)).toBe(false);
  });

  test('returns true when average >= 10/20', () => {
    expect(studentValidatedYear([{ value: 12, maxValue: 20 }])).toBe(true);
  });

  test('returns false when average < 10/20', () => {
    expect(studentValidatedYear([{ value: 8, maxValue: 20 }])).toBe(false);
  });
});

describe('ReinscriptionService.reEnrollStudent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects missing data', async () => {
    await expect(reEnrollStudent(null, 'class-2', '2026-2027')).resolves.toEqual({
      ok: false,
      error: 'data',
    });
  });

  test('rejects unknown student', async () => {
    prisma.student.findUnique.mockResolvedValue(null);
    await expect(reEnrollStudent('stu-1', 'class-2', '2026-2027')).resolves.toEqual({
      ok: false,
      error: 'student',
    });
  });

  test('promotes validated student to next class', async () => {
    prisma.student.findUnique.mockResolvedValue({
      id: 'stu-1',
      schoolId: 'school-1',
      classId: 'class-ce1',
      gender: 'F',
      class: { id: 'class-ce1', name: 'CE1 A', level: 'CE1' },
      grades: [{ value: 14, maxValue: 20 }],
    });
    prisma.studentYearRecord.findUnique.mockResolvedValue(null);
    prisma.class.findFirst.mockResolvedValue({ id: 'class-ce2', name: 'CE2 A', level: 'CE2' });
    prisma.$transaction.mockImplementation(async (ops) => {
      const results = [];
      for (const op of ops) results.push(await op);
      return results;
    });
    prisma.student.update.mockResolvedValue({ id: 'stu-1', classId: 'class-ce2' });
    prisma.studentYearRecord.create.mockResolvedValue({
      id: 'rec-1',
      studentId: 'stu-1',
      schoolYear: '2026-2027',
      classId: 'class-ce2',
      repeatYear: false,
      status: 'inscrit',
    });

    const result = await reEnrollStudent('stu-1', 'class-ce2', '2026-2027');

    expect(result.ok).toBe(true);
    expect(result.promoted).toBe(true);
    expect(result.repeated).toBe(false);
    expect(prisma.studentYearRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          repeatYear: false,
          status: 'inscrit',
          classId: 'class-ce2',
        }),
      }),
    );
  });

  test('repeats student without grades in same class', async () => {
    prisma.student.findUnique.mockResolvedValue({
      id: 'stu-2',
      schoolId: 'school-1',
      classId: 'class-ce1',
      gender: 'M',
      class: { id: 'class-ce1', name: 'CE1 A', level: 'CE1' },
      grades: [],
    });
    prisma.studentYearRecord.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (ops) => {
      const results = [];
      for (const op of ops) results.push(await op);
      return results;
    });
    prisma.student.update.mockResolvedValue({ id: 'stu-2', classId: 'class-ce1' });
    prisma.studentYearRecord.create.mockResolvedValue({
      id: 'rec-2',
      repeatYear: true,
      status: 'inscrit',
    });

    const result = await reEnrollStudent('stu-2', 'class-ce1', '2026-2027');

    expect(result.ok).toBe(true);
    expect(result.promoted).toBe(false);
    expect(result.repeated).toBe(true);
    expect(prisma.student.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { classId: 'class-ce1' } }),
    );
  });

  test('rejects repeat with different next class', async () => {
    prisma.student.findUnique.mockResolvedValue({
      id: 'stu-3',
      schoolId: 'school-1',
      classId: 'class-ce1',
      class: { id: 'class-ce1' },
      grades: [{ value: 5, maxValue: 20 }],
    });
    prisma.studentYearRecord.findUnique.mockResolvedValue(null);

    const result = await reEnrollStudent('stu-3', 'class-ce2', '2026-2027');

    expect(result).toEqual({ ok: false, error: 'repeat_class' });
  });

  test('rejects duplicate enrollment for same year', async () => {
    prisma.student.findUnique.mockResolvedValue({
      id: 'stu-4',
      classId: 'class-ce1',
      grades: [{ value: 15, maxValue: 20 }],
    });
    prisma.studentYearRecord.findUnique.mockResolvedValue({ id: 'existing' });

    const result = await reEnrollStudent('stu-4', 'class-ce2', '2026-2027');

    expect(result).toEqual({ ok: false, error: 'already_enrolled' });
  });
});

describe('ReinscriptionService.getReinscriptionStats', () => {
  beforeEach(() => jest.clearAllMocks());

  test('aggregates promoted and repeated counts', async () => {
    prisma.studentYearRecord.findMany
      .mockResolvedValueOnce([
        { repeatYear: false, gender: 'M', schoolYear: '2026-2027', classId: 'c1', class: { name: 'CE1', level: 'CE1' } },
        { repeatYear: true, gender: 'F', schoolYear: '2026-2027', classId: 'c1', class: { name: 'CE1', level: 'CE1' } },
        { repeatYear: true, gender: 'M', schoolYear: '2026-2027', classId: 'c1', class: { name: 'CE1', level: 'CE1' } },
      ])
      .mockResolvedValueOnce([
        { schoolYear: '2025-2026', repeatYear: true },
        { schoolYear: '2025-2026', repeatYear: false },
        { schoolYear: '2026-2027', repeatYear: true },
        { schoolYear: '2026-2027', repeatYear: false },
        { schoolYear: '2026-2027', repeatYear: false },
      ]);

    const stats = await getReinscriptionStats('school-1', '2026-2027');

    expect(stats.ok).toBe(true);
    expect(stats.total).toBe(3);
    expect(stats.promoted).toBe(1);
    expect(stats.repeated).toBe(2);
    expect(stats.repeatGender.boys).toBe(1);
    expect(stats.repeatGender.girls).toBe(1);
    expect(stats.historicalRepeatRate.length).toBe(2);
  });
});

describe('ReinscriptionService.listReinscriptionRows', () => {
  beforeEach(() => jest.clearAllMocks());

  test('merges students with year records', async () => {
    prisma.student.findMany.mockResolvedValue([
      {
        id: 'stu-1',
        firstName: 'Awa',
        lastName: 'Koné',
        class: { id: 'c1', name: 'CE1 A', level: 'CE1' },
      },
    ]);
    prisma.studentYearRecord.findMany.mockResolvedValue([
      {
        studentId: 'stu-1',
        repeatYear: false,
        class: { id: 'c2', name: 'CE2 A', level: 'CE2' },
      },
    ]);
    prisma.class.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

    const result = await listReinscriptionRows('school-1', '2026-2027');

    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].enrolled).toBe(true);
    expect(result.rows[0].repeatYear).toBe(false);
  });
});

describe('ReinscriptionService.determineCause', () => {
  test('returns Mixte when high absences and low grades', () => {
    expect(determineCause(ABSENCE_THRESHOLD + 1, GRADE_THRESHOLD - 1, true)).toBe('Mixte');
  });

  test('returns Absences élevées when only absences exceed threshold', () => {
    expect(determineCause(ABSENCE_THRESHOLD + 5, GRADE_THRESHOLD + 2, true)).toBe('Absences élevées');
  });

  test('returns Notes faibles when only grades below threshold', () => {
    expect(determineCause(ABSENCE_THRESHOLD, GRADE_THRESHOLD - 2, true)).toBe('Notes faibles');
  });

  test('returns Notes faibles when no grades', () => {
    expect(determineCause(0, 0, false)).toBe('Notes faibles');
  });

  test('returns Autre when grades ok and absences low', () => {
    expect(determineCause(ABSENCE_THRESHOLD, GRADE_THRESHOLD + 1, true)).toBe('Autre');
  });
});

describe('ReinscriptionService.analyzeRedoublementCauses', () => {
  beforeEach(() => jest.clearAllMocks());

  function mockRepeater(id, firstName, lastName, gender) {
    return {
      studentId: id,
      repeatYear: true,
      classId: 'c1',
      student: { id, firstName, lastName, gender, classId: 'c1' },
      class: { id: 'c1', name: 'A', level: 'CE1' },
    };
  }

  test('returns empty array when no repeaters', async () => {
    prisma.studentYearRecord.findMany.mockResolvedValue([]);
    const result = await analyzeRedoublementCauses('2026-2027', 'school-1');
    expect(result).toEqual([]);
  });

  test('classifies mixte cause (high absences + low grades)', async () => {
    prisma.studentYearRecord.findMany.mockResolvedValue([
      mockRepeater('stu-mix', 'Awa', 'Koné', 'F'),
    ]);
    prisma.absence.findMany.mockResolvedValue(
      Array.from({ length: ABSENCE_THRESHOLD + 5 }, () => ({ studentId: 'stu-mix' })),
    );
    prisma.grade.findMany.mockResolvedValue([
      { studentId: 'stu-mix', value: 6, maxValue: 20 },
    ]);

    const result = await analyzeRedoublementCauses('2026-2027', 'school-1');

    expect(result).toHaveLength(1);
    expect(result[0].cause).toBe('Mixte');
    expect(result[0].absences).toBe(ABSENCE_THRESHOLD + 5);
    expect(result[0].avgGrade).toBe(6);
  });

  test('classifies absences cause only', async () => {
    prisma.studentYearRecord.findMany.mockResolvedValue([
      mockRepeater('stu-abs', 'Ibrahim', 'Diallo', 'M'),
    ]);
    prisma.absence.findMany.mockResolvedValue(
      Array.from({ length: ABSENCE_THRESHOLD + 10 }, () => ({ studentId: 'stu-abs' })),
    );
    prisma.grade.findMany.mockResolvedValue([
      { studentId: 'stu-abs', value: 14, maxValue: 20 },
    ]);

    const result = await analyzeRedoublementCauses('2026-2027', 'school-1');

    expect(result[0].cause).toBe('Absences élevées');
    expect(result[0].avgGrade).toBe(14);
  });

  test('classifies notes cause only', async () => {
    prisma.studentYearRecord.findMany.mockResolvedValue([
      mockRepeater('stu-notes', 'Marie', 'Ouattara', 'F'),
    ]);
    prisma.absence.findMany.mockResolvedValue([]);
    prisma.grade.findMany.mockResolvedValue([
      { studentId: 'stu-notes', value: 7, maxValue: 20 },
    ]);

    const result = await analyzeRedoublementCauses('2026-2027', 'school-1');

    expect(result[0].cause).toBe('Notes faibles');
    expect(result[0].absences).toBe(0);
    expect(result[0].avgGrade).toBe(7);
  });
});

describe('ReinscriptionService.getRedoublementCauseStats', () => {
  beforeEach(() => jest.clearAllMocks());

  test('aggregates cause counts and absence comparison', async () => {
    prisma.studentYearRecord.findMany
      .mockResolvedValueOnce([
        {
          studentId: 'stu-1',
          repeatYear: true,
          classId: 'c1',
          student: { id: 'stu-1', firstName: 'A', lastName: 'B', gender: 'M' },
          class: { id: 'c1', name: 'A', level: 'CE1' },
        },
      ])
      .mockResolvedValueOnce([
        { studentId: 'stu-1', repeatYear: true },
        { studentId: 'stu-2', repeatYear: false },
      ])
      .mockResolvedValueOnce([{ schoolYear: '2026-2027' }]);

    prisma.absence.findMany
      .mockResolvedValueOnce(Array.from({ length: 35 }, () => ({ studentId: 'stu-1' })))
      .mockResolvedValueOnce([
        ...Array.from({ length: 35 }, () => ({ studentId: 'stu-1' })),
        { studentId: 'stu-2' },
      ]);

    prisma.grade.findMany.mockResolvedValue([
      { studentId: 'stu-1', value: 8, maxValue: 20 },
    ]);

    const stats = await getRedoublementCauseStats('school-1', '2026-2027');

    expect(stats.ok).toBe(true);
    expect(stats.causes).toHaveLength(1);
    expect(stats.causeCounts.Mixte).toBe(1);
    expect(stats.absencesComparison.repeatersAvg).toBe(35);
    expect(stats.absencesComparison.nonRepeatersAvg).toBe(1);
  });
});

describe('ReinscriptionService.getGroupRedoublementCauses', () => {
  beforeEach(() => jest.clearAllMocks());

  function mockRepeater(id, firstName, lastName, gender) {
    return {
      studentId: id,
      repeatYear: true,
      classId: 'c1',
      student: { id, firstName, lastName, gender, classId: 'c1' },
      class: { id: 'c1', name: 'A', level: 'CE1' },
    };
  }

  test('returns error when groupId missing', async () => {
    const result = await getGroupRedoublementCauses(null, '2026-2027');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('data');
  });

  test('returns error when group not found', async () => {
    prisma.group.findUnique.mockResolvedValue(null);
    const result = await getGroupRedoublementCauses('group-missing', '2026-2027');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('group');
  });

  test('aggregates per-school stats with atRisk flag', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 'group-1',
      name: 'Groupe Test',
      schools: [
        { id: 'school-a', name: 'École A' },
        { id: 'school-b', name: 'École B' },
      ],
      organization: null,
    });

    prisma.studentYearRecord.findMany.mockImplementation(({ where }) => {
      if (where.schoolId === 'school-a' && where.repeatYear === true) {
        return Promise.resolve([mockRepeater('stu-a1', 'Awa', 'Koné', 'F')]);
      }
      if (where.schoolId === 'school-b' && where.repeatYear === true) {
        return Promise.resolve([
          mockRepeater('stu-b1', 'Ibrahim', 'Diallo', 'M'),
          mockRepeater('stu-b2', 'Marie', 'Ouattara', 'F'),
        ]);
      }
      if (where.schoolId === 'school-a' && where.schoolYear === '2026-2027') {
        return Promise.resolve([
          { repeatYear: true },
          { repeatYear: false },
          { repeatYear: false },
          { repeatYear: false },
        ]);
      }
      if (where.schoolId === 'school-b' && where.schoolYear === '2026-2027') {
        return Promise.resolve([
          { repeatYear: true },
          { repeatYear: true },
          { repeatYear: false },
          { repeatYear: false },
          { repeatYear: false },
        ]);
      }
      if (where.schoolId === 'school-a' && where.repeatYear === true && where.schoolYear === undefined) {
        return Promise.resolve([{ schoolYear: '2026-2027' }]);
      }
      if (where.schoolId === 'school-b' && where.repeatYear === true && where.schoolYear === undefined) {
        return Promise.resolve([{ schoolYear: '2026-2027' }]);
      }
      if (where.schoolId === 'school-a') {
        return Promise.resolve([
          { repeatYear: true, gender: 'F', schoolYear: '2026-2027', classId: 'c1', class: { name: 'CE1', level: 'CE1' } },
        ]);
      }
      if (where.schoolId === 'school-b') {
        return Promise.resolve([
          { repeatYear: true, gender: 'M', schoolYear: '2026-2027', classId: 'c1', class: { name: 'CE1', level: 'CE1' } },
          { repeatYear: true, gender: 'F', schoolYear: '2026-2027', classId: 'c1', class: { name: 'CE1', level: 'CE1' } },
        ]);
      }
      return Promise.resolve([]);
    });

    prisma.absence.findMany.mockImplementation(({ where }) => {
      if (where.studentId?.in?.includes('stu-a1')) {
        return Promise.resolve(Array.from({ length: 35 }, () => ({ studentId: 'stu-a1' })));
      }
      if (where.studentId?.in?.includes('stu-b1')) {
        return Promise.resolve(Array.from({ length: 5 }, () => ({ studentId: 'stu-b1' })));
      }
      return Promise.resolve([]);
    });

    prisma.grade.findMany.mockImplementation(({ where }) => {
      if (where.studentId?.in?.includes('stu-a1')) {
        return Promise.resolve([{ studentId: 'stu-a1', value: 8, maxValue: 20 }]);
      }
      if (where.studentId?.in?.includes('stu-b1')) {
        return Promise.resolve([{ studentId: 'stu-b1', value: 7, maxValue: 20 }]);
      }
      if (where.studentId?.in?.includes('stu-b2')) {
        return Promise.resolve([{ studentId: 'stu-b2', value: 6, maxValue: 20 }]);
      }
      return Promise.resolve([]);
    });

    const result = await getGroupRedoublementCauses('group-1', '2026-2027');

    expect(result.ok).toBe(true);
    expect(result.groupName).toBe('Groupe Test');
    expect(result.schools).toHaveLength(2);

    const schoolA = result.schools.find((s) => s.schoolId === 'school-a');
    const schoolB = result.schools.find((s) => s.schoolId === 'school-b');

    expect(schoolA.totalRedoublants).toBe(1);
    expect(schoolA.primaryCause).toBe('Mixte');
    expect(schoolA.repeatRate).toBe(0.25);
    expect(schoolA.atRisk).toBe(true);

    expect(schoolB.totalRedoublants).toBe(2);
    expect(schoolB.primaryCause).toBe('Notes faibles');
    expect(schoolB.repeatRate).toBe(0.4);
    expect(schoolB.atRisk).toBe(true);

    expect(result.groupTotals.totalRedoublants).toBe(3);
    expect(result.groupTotals.atRiskCount).toBe(2);
    expect(result.thresholds.atRiskRate).toBe(AT_RISK_REPEAT_RATE);
  });

  test('falls back to organization schools when group.schools empty', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 'group-2',
      name: 'Groupe Org',
      schools: [],
      organization: {
        schools: [{ id: 'school-org', name: 'École Org' }],
      },
    });

    prisma.studentYearRecord.findMany.mockResolvedValue([]);

    const result = await getGroupRedoublementCauses('group-2', '2026-2027');

    expect(result.ok).toBe(true);
    expect(result.schools).toHaveLength(1);
    expect(result.schools[0].schoolName).toBe('École Org');
  });
});
