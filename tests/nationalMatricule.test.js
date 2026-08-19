jest.mock('../src/config/database', () => ({
  student: { findFirst: jest.fn(), create: jest.fn() },
  class: { findFirst: jest.fn() },
}));

jest.mock('../src/utils/audit', () => ({
  logAudit: jest.fn(),
}));

const prisma = require('../src/config/database');
const {
  normalizeNationalMatricule,
  uniqueStudentError,
  findNationalMatriculeConflict,
  assertNationalMatriculeAvailable,
} = require('../src/utils/nationalMatricule');
const { applyStudent } = require('../src/services/offlineActions');

describe('national matricule', () => {
  test('normalizes blank to null and trims', () => {
    expect(normalizeNationalMatricule('')).toBeNull();
    expect(normalizeNationalMatricule('  ')).toBeNull();
    expect(normalizeNationalMatricule(' MEN-001 ')).toBe('MEN-001');
  });

  test('maps unique violations to school vs national matricule', () => {
    expect(uniqueStudentError({ code: 'P2002', meta: { target: ['schoolId', 'matricule'] } })).toBe('matricule');
    expect(uniqueStudentError({ code: 'P2002', meta: { target: ['schoolId', 'nationalMatricule'] } })).toBe('nationalMatricule');
    expect(uniqueStudentError({ code: 'P2003' })).toBeNull();
  });

  test('conflict lookup is isolated to the given school', async () => {
    prisma.student.findFirst.mockResolvedValue(null);
    const miss = await findNationalMatriculeConflict({
      prisma,
      schoolId: 'school-b',
      nationalMatricule: 'MEN-001',
    });
    expect(miss).toBeNull();
    expect(prisma.student.findFirst).toHaveBeenCalledWith({
      where: {
        schoolId: 'school-b',
        nationalMatricule: { equals: 'MEN-001', mode: 'insensitive' },
      },
      select: { id: true, schoolId: true, nationalMatricule: true },
    });
  });

  test('same national matricule is rejected inside the school, allowed conceptually in another', async () => {
    prisma.student.findFirst.mockResolvedValueOnce({
      id: 'stu-1',
      schoolId: 'school-a',
      nationalMatricule: 'MEN-001',
    });
    const sameSchool = await assertNationalMatriculeAvailable({
      prisma,
      schoolId: 'school-a',
      nationalMatricule: 'MEN-001',
    });
    expect(sameSchool).toEqual({ ok: false, error: 'nationalMatricule' });

    prisma.student.findFirst.mockResolvedValueOnce(null);
    const otherSchool = await assertNationalMatriculeAvailable({
      prisma,
      schoolId: 'school-b',
      nationalMatricule: 'MEN-001',
    });
    expect(otherSchool).toEqual({ ok: true });
  });
});

describe('applyStudent national matricule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.class.findFirst.mockResolvedValue({ id: 'cl-1', schoolId: 'sch-1' });
    prisma.student.create.mockResolvedValue({ id: 'stu-new' });
    prisma.student.findFirst.mockResolvedValue(null);
  });

  test('stores nationalMatricule without touching matricule école', async () => {
    const result = await applyStudent({
      user: { role: 'SCHOOL_ADMIN', school: { id: 'sch-1' } },
      payload: {
        firstName: 'Kofi',
        lastName: 'Yao',
        classId: 'cl-1',
        matricule: 'IG-DEMO-001',
        nationalMatricule: 'MEN-CI-001',
      },
    });
    expect(result.ok).toBe(true);
    expect(prisma.student.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        matricule: 'IG-DEMO-001',
        nationalMatricule: 'MEN-CI-001',
      }),
    }));
  });

  test('rejects a duplicate national matricule in the same school', async () => {
    prisma.student.findFirst.mockResolvedValue({ id: 'stu-other', schoolId: 'sch-1' });
    const result = await applyStudent({
      user: { role: 'SCHOOL_ADMIN', school: { id: 'sch-1' } },
      payload: {
        firstName: 'Awa',
        lastName: 'Koné',
        classId: 'cl-1',
        nationalMatricule: 'MEN-CI-001',
      },
    });
    expect(result).toEqual({ ok: false, error: 'nationalMatricule', entity: 'student' });
    expect(prisma.student.create).not.toHaveBeenCalled();
  });
});
