jest.mock('../src/config/database', () => ({
  user: { findUnique: jest.fn(), create: jest.fn() },
  school: { findUnique: jest.fn() },
  teacher: { findUnique: jest.fn() },
  staffProfile: { findUnique: jest.fn() },
  payrollRun: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  payslip: { upsert: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
  salaryAdvance: { findMany: jest.fn() },
  leaveRequest: { create: jest.fn() },
  evaluation: { create: jest.fn() },
}));

jest.mock('../src/utils/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed-password'),
  comparePassword: jest.fn(),
}));

jest.mock('../src/utils/hr', () => {
  const actual = jest.requireActual('../src/utils/hr');
  return {
    ...actual,
    ensureStaffProfile: jest.fn().mockResolvedValue({ id: 'profile-1', baseSalary: 250000 }),
  };
});

jest.mock('../services/export', () => ({
  generatePayrollPDF: jest.fn().mockResolvedValue({
    ok: true,
    pdfUrl: '/uploads/payslips/fiche-paie-test.pdf',
  }),
}));

jest.mock('../services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { calcNetPay, validateLeaveRequest } = require('../src/utils/hr');
const prisma = require('../src/config/database');
const { generatePayrollPDF } = require('../services/export');
const {
  createTeacherProfile,
  recordLeave,
  generatePayroll,
  evaluateTeacher,
  parseMonth,
} = require('../services/HRService');

describe('HR payroll calc', () => {
  test('calcNetPay basic salary', () => {
    expect(calcNetPay({ baseSalary: 200000, bonuses: 10000, deductions: 5000, advances: 20000 })).toBe(185000);
  });

  test('calcNetPay hourly vacataire', () => {
    expect(calcNetPay({ baseSalary: 0, hourlyRate: 5000, hoursWorked: 40, advances: 0 })).toBe(200000);
  });

  test('calcNetPay never negative', () => {
    expect(calcNetPay({ baseSalary: 10000, deductions: 50000 })).toBe(0);
  });
});

describe('Leave workflow', () => {
  test('rejects missing dates', () => {
    expect(validateLeaveRequest({})).toEqual({ ok: false, error: 'dates' });
  });

  test('rejects end before start', () => {
    expect(validateLeaveRequest({ startDate: '2026-07-10', endDate: '2026-07-05' })).toEqual({
      ok: false,
      error: 'range',
    });
  });

  test('accepts valid range', () => {
    expect(validateLeaveRequest({ startDate: '2026-07-01', endDate: '2026-07-05' })).toEqual({ ok: true });
  });
});

describe('HRService.parseMonth', () => {
  test('parses YYYY-MM', () => {
    expect(parseMonth('2026-08')).toEqual({ month: 8, year: 2026 });
  });

  test('parses object', () => {
    expect(parseMonth({ month: 3, year: 2026 })).toEqual({ month: 3, year: 2026 });
  });
});

describe('HRService.createTeacherProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates a teacher with valid data', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.school.findUnique.mockResolvedValue({ id: 'school-1', name: 'École Demo' });
    prisma.user.create.mockResolvedValue({
      id: 'user-1',
      email: 'awa.kone@demo.ci',
      firstName: 'Awa',
      lastName: 'Koné',
      teacher: { id: 'teacher-1', schoolId: 'school-1', subject: 'Mathématiques' },
    });

    const result = await createTeacherProfile({
      email: 'awa.kone@demo.ci',
      firstName: 'Awa',
      lastName: 'Koné',
      schoolId: 'school-1',
      subject: 'Mathématiques',
      password: 'demo1234',
    });

    expect(result.ok).toBe(true);
    expect(result.teacher.id).toBe('teacher-1');
    expect(result.user.email).toBe('awa.kone@demo.ci');
    expect(prisma.user.create).toHaveBeenCalled();
  });

  test('rejects incomplete data', async () => {
    await expect(createTeacherProfile({ email: 'x@y.ci' })).resolves.toEqual({ ok: false, error: 'data' });
  });
});

describe('HRService.recordLeave', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1', schoolId: 'school-1' });
  });

  test('rejects invalid dates (end before start)', async () => {
    const result = await recordLeave('teacher-1', {
      startDate: '2026-07-10',
      endDate: '2026-07-05',
    });
    expect(result).toEqual({ ok: false, error: 'range' });
    expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
  });

  test('rejects missing dates', async () => {
    await expect(recordLeave('teacher-1', {})).resolves.toEqual({ ok: false, error: 'dates' });
  });
});

describe('HRService.generatePayroll', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    generatePayrollPDF.mockResolvedValue({
      ok: true,
      pdfUrl: '/uploads/payslips/fiche-paie-test.pdf',
    });
  });

  test('generates payroll for a given month', async () => {
    prisma.teacher.findUnique.mockResolvedValue({
      id: 'teacher-1',
      schoolId: 'school-1',
      subject: 'Mathématiques',
      staffProfile: { baseSalary: 250000, contractType: 'CDI' },
      user: { firstName: 'Awa', lastName: 'Koné', email: 'awa.kone@demo.ci' },
      school: { id: 'school-1', name: 'École Demo' },
    });
    prisma.staffProfile.findUnique.mockResolvedValue({
      baseSalary: 250000,
      contractType: 'CDI',
    });
    prisma.payrollRun.findUnique.mockResolvedValue(null);
    prisma.payrollRun.create.mockResolvedValue({
      id: 'run-1',
      month: 8,
      year: 2026,
      status: 'DRAFT',
    });
    prisma.salaryAdvance.findMany.mockResolvedValue([]);
    prisma.payslip.upsert.mockResolvedValue({
      id: 'payslip-1',
      netPay: 250000,
      pdfUrl: null,
    });
    prisma.payslip.update.mockResolvedValue({
      id: 'payslip-1',
      netPay: 250000,
      pdfUrl: '/uploads/payslips/fiche-paie-test.pdf',
    });
    prisma.payslip.aggregate.mockResolvedValue({ _sum: { netPay: 250000 } });
    prisma.payrollRun.update.mockResolvedValue({ id: 'run-1', status: 'VALIDATED' });

    const result = await generatePayroll('teacher-1', '2026-08');

    expect(result.ok).toBe(true);
    expect(result.netPay).toBe(250000);
    expect(result.pdfUrl).toBe('/uploads/payslips/fiche-paie-test.pdf');
    expect(prisma.payrollRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ month: 8, year: 2026 }),
      }),
    );
    expect(generatePayrollPDF).toHaveBeenCalledWith('teacher-1', { month: 8, year: 2026 });
  });
});

describe('HRService.evaluateTeacher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('records a score and comments', async () => {
    prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1', schoolId: 'school-1' });
    prisma.evaluation.create.mockResolvedValue({
      id: 'eval-1',
      teacherId: 'teacher-1',
      score: 16,
      comments: 'Très bon trimestre',
    });

    const result = await evaluateTeacher('teacher-1', 16, 'Très bon trimestre');
    expect(result.ok).toBe(true);
    expect(result.evaluation.score).toBe(16);
    expect(prisma.evaluation.create).toHaveBeenCalledWith({
      data: { teacherId: 'teacher-1', score: 16, comments: 'Très bon trimestre' },
    });
  });

  test('rejects an invalid score', async () => {
    await expect(evaluateTeacher('teacher-1', 25, 'trop')).resolves.toEqual({ ok: false, error: 'score' });
  });
});
