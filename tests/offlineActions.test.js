jest.mock('../src/config/database', () => ({
  student: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  absence: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  parentStudent: { findFirst: jest.fn(), findMany: jest.fn() },
  grade: { create: jest.fn() },
  homework: { create: jest.fn() },
  homeworkSubmission: { create: jest.fn() },
  teacherClass: { findFirst: jest.fn() },
  class: { create: jest.fn(), findFirst: jest.fn() },
  user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  payment: { create: jest.fn() },
  paymentProof: { update: jest.fn() },
  school: { findFirst: jest.fn() },
  notification: { create: jest.fn() },
}));

jest.mock('../services/NotificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('../services/PaymentService', () => ({
  validateProof: jest.fn(),
  MAX_PROOF_SIZE: 5 * 1024 * 1024,
}));

jest.mock('../services/HRService', () => ({
  createTeacherProfile: jest.fn(),
}));

jest.mock('../src/utils/audit', () => ({
  logAudit: jest.fn(),
}));

jest.mock('../services/StorageService', () => ({
  storeMulterFile: jest.fn(),
}));

const prisma = require('../src/config/database');
const { createTeacherProfile } = require('../services/HRService');
const {
  applyPayment,
  applyTeacher,
  applyItem,
  applyClass,
  applyStudent,
  resolveTeacherConflict,
} = require('../src/services/offlineActions');

describe('offlineActions.applyPayment IDOR', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects a payment for a student not linked to the parent', async () => {
    prisma.parentStudent.findFirst.mockResolvedValue(null);
    const result = await applyPayment({
      user: { role: 'PARENT', parentProfile: { id: 'parent-1' } },
      payload: { studentId: 'stu-other', amount: '5000' },
    });
    expect(result).toEqual({ ok: false, error: 'child', entity: 'payment' });
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  test('refuses a temp studentId instead of writing it to Prisma', async () => {
    const result = await applyPayment({
      user: { role: 'PARENT', parentProfile: { id: 'parent-1' } },
      payload: { studentId: 'tmp_abc', amount: '5000' },
    });
    expect(result.error).toBe('child');
    expect(prisma.parentStudent.findFirst).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
});

describe('offlineActions teacher conflict', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns conflict when email already exists', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-1',
      email: 'prof@ecole.ci',
      firstName: 'Awa',
      lastName: 'Kone',
      role: 'TEACHER',
      phone: '0700000000',
    });
    const result = await applyTeacher({
      user: { role: 'SCHOOL_ADMIN', school: { id: 'sch-1' } },
      payload: { email: 'prof@ecole.ci', firstName: 'Awa', lastName: 'Kone' },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('conflict');
    expect(result.entity).toBe('teacher');
    expect(result.existing.email).toBe('prof@ecole.ci');
    expect(createTeacherProfile).not.toHaveBeenCalled();
  });

  test('merge resolve returns the existing teacher id for the same school', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-1',
      teacher: { id: 'teach-1', schoolId: 'sch-1' },
    });
    const result = await resolveTeacherConflict({
      user: { role: 'SCHOOL_ADMIN', school: { id: 'sch-1' } },
      action: 'merge',
      existing: { id: 'u-1' },
    });
    expect(result).toMatchObject({ ok: true, status: 'synced', serverId: 'teach-1', merged: true });
  });

  test('cancel resolve drops the invite', async () => {
    const result = await resolveTeacherConflict({
      user: { role: 'SCHOOL_ADMIN', school: { id: 'sch-1' } },
      action: 'cancel',
    });
    expect(result).toEqual({ ok: true, status: 'cancelled' });
  });
});

describe('offlineActions temp ids on sync', () => {
  beforeEach(() => jest.clearAllMocks());

  test('maps a temp class id then creates the student with the server id', async () => {
    prisma.class.create.mockResolvedValue({ id: 'clreal' });
    prisma.class.findFirst.mockResolvedValue({ id: 'clreal', schoolId: 'sch-1' });
    prisma.student.create.mockResolvedValue({ id: 'stureal' });

    const classResult = await applyItem({
      user: { role: 'SCHOOL_ADMIN', school: { id: 'sch-1', currentSchoolYear: '2025-2026' } },
      type: 'class',
      payload: { name: 'CM2 A', level: 'CM2', clientTempId: 'tmp_class' },
      idMap: {},
    });
    expect(classResult.ok).toBe(true);
    expect(classResult.id).toBe('clreal');

    const studentResult = await applyItem({
      user: { role: 'SCHOOL_ADMIN', school: { id: 'sch-1' } },
      type: 'student',
      payload: { firstName: 'Koffi', lastName: 'Yao', classId: 'tmp_class' },
      idMap: { tmp_class: 'clreal' },
    });
    expect(studentResult.ok).toBe(true);
    expect(prisma.student.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ classId: 'clreal' }),
    }));
  });

  test('rejects a student whose classId is still a temp uuid', async () => {
    const result = await applyStudent({
      user: { role: 'SCHOOL_ADMIN', school: { id: 'sch-1' } },
      payload: { firstName: 'Awa', lastName: 'Kone', classId: '550e8400-e29b-41d4-a716-446655440000' },
    });
    expect(result).toEqual({ ok: false, error: 'unknown_id', entity: 'student' });
    expect(prisma.student.create).not.toHaveBeenCalled();
  });

  test('applyClass requires a school admin session', async () => {
    const result = await applyClass({
      user: { role: 'TEACHER', teacher: { id: 't1' } },
      payload: { name: 'CM2', level: 'CM2' },
    });
    expect(result.error).toBe('forbidden');
  });
});
