jest.mock('../src/config/database', () => ({
  student: { findFirst: jest.fn(), findMany: jest.fn() },
  feeType: { findFirst: jest.fn(), findMany: jest.fn() },
  payment: { findMany: jest.fn() },
  socialCase: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('../src/utils/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../src/config/database');
const {
  applyDiscount,
  allocateDue,
  createCase,
  closeCase,
  getStudentFeeBalance,
} = require('../src/services/socialCaseService');
const {
  createSocialCase,
  closeSocialCase,
} = require('../src/controllers/socialCaseController');

const SCHOOL = { id: 'school-1', name: 'IGEST Yopougon' };
const OTHER_SCHOOL_ID = 'school-other';
const STUDENT = {
  id: 'stu-1',
  schoolId: 'school-1',
  firstName: 'Kofi',
  lastName: 'Yao',
  matricule: 'IG-DEMO-001',
  class: { name: '6e A' },
};
const FEE = { id: 'fee-1', name: 'Scolarité Trimestre 1', amount: 75000, schoolId: 'school-1', isActive: true };
const CASE_ROW = {
  id: 'case-1',
  schoolId: SCHOOL.id,
  studentId: STUDENT.id,
  motif: 'orphelin',
  motifDetail: null,
  discountType: 'PERCENT',
  discountValue: 50,
  notes: null,
  status: 'actif',
  installments: [
    { n: 1, dueDate: '2026-09-15', amount: 18750 },
    { n: 2, dueDate: '2026-10-15', amount: 18750 },
  ],
  student: STUDENT,
};

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    render: jest.fn().mockReturnThis(),
    redirect: jest.fn(),
  };
}

describe('remise math', () => {
  test('PERCENT 50 on 75 000 → 37 500', () => {
    expect(applyDiscount(75000, {
      status: 'actif',
      discountType: 'PERCENT',
      discountValue: 50,
    })).toBe(37500);
  });

  test('FIXED 25 000 on 75 000 → 50 000', () => {
    expect(applyDiscount(75000, {
      status: 'actif',
      discountType: 'FIXED',
      discountValue: 25000,
    })).toBe(50000);
  });

  test('closed case does not reduce the amount', () => {
    expect(applyDiscount(75000, {
      status: 'clos',
      discountType: 'PERCENT',
      discountValue: 50,
    })).toBe(75000);
  });

  test('FIXED remise is applied once on the catalogue total', () => {
    expect(allocateDue([75000, 30000], applyDiscount(105000, {
      status: 'actif',
      discountType: 'FIXED',
      discountValue: 25000,
    }))).toEqual([57143, 22857]);
  });
});

describe('createCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.student.findFirst.mockResolvedValue(STUDENT);
    prisma.socialCase.findFirst.mockResolvedValue(null);
    prisma.feeType.findMany.mockResolvedValue([FEE]);
    prisma.socialCase.create.mockResolvedValue(CASE_ROW);
  });

  test('creates an active social case with percent remise', async () => {
    const result = await createCase({
      school: SCHOOL,
      body: {
        studentId: STUDENT.id,
        motif: 'orphelin',
        discountType: 'PERCENT',
        discountValue: '50',
        installmentCount: '2',
        firstDueDate: '2026-09-15',
      },
    });

    expect(result.ok).toBe(true);
    expect(prisma.socialCase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        schoolId: SCHOOL.id,
        studentId: STUDENT.id,
        motif: 'orphelin',
        discountType: 'PERCENT',
        discountValue: 50,
        status: 'actif',
        installments: [
          { n: 1, dueDate: '2026-09-15', amount: 18750 },
          { n: 2, dueDate: '2026-10-15', amount: 18750 },
        ],
      }),
    }));
  });

  test('refuses a student from another school', async () => {
    prisma.student.findFirst.mockResolvedValue(null);
    const result = await createCase({
      school: SCHOOL,
      body: {
        studentId: 'stu-other',
        motif: 'precarite',
        discountType: 'PERCENT',
        discountValue: '30',
      },
    });
    expect(result).toEqual({ ok: false, error: 'forbidden', status: 403 });
    expect(prisma.socialCase.create).not.toHaveBeenCalled();
  });
});

describe('getStudentFeeBalance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.student.findFirst.mockResolvedValue(STUDENT);
    prisma.feeType.findMany.mockResolvedValue([FEE]);
    prisma.payment.findMany.mockResolvedValue([{ amount: 10000, feeTypeId: FEE.id }]);
    prisma.socialCase.findFirst.mockResolvedValue(CASE_ROW);
  });

  test('reflects the remise on remaining fees', async () => {
    const result = await getStudentFeeBalance({
      schoolId: SCHOOL.id,
      studentId: STUDENT.id,
    });

    expect(result.ok).toBe(true);
    expect(result.hasRemise).toBe(true);
    expect(result.totalCatalog).toBe(75000);
    expect(result.totalDue).toBe(37500);
    expect(result.totalPaid).toBe(10000);
    expect(result.totalRemaining).toBe(27500);
    expect(result.lines[0].remaining).toBe(27500);
  });

  test('returns 403 when the student is not in the school', async () => {
    prisma.student.findFirst.mockResolvedValue(null);
    const result = await getStudentFeeBalance({
      schoolId: SCHOOL.id,
      studentId: 'stu-other',
    });
    expect(result).toEqual({ ok: false, error: 'forbidden', status: 403 });
  });
});

describe('closeCase', () => {
  test('scopes close to the requesting school', async () => {
    prisma.socialCase.findFirst.mockResolvedValue(null);
    const result = await closeCase({ schoolId: OTHER_SCHOOL_ID, id: CASE_ROW.id });
    expect(result.status).toBe(403);
    expect(prisma.socialCase.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: CASE_ROW.id, schoolId: OTHER_SCHOOL_ID }),
    }));
    expect(prisma.socialCase.update).not.toHaveBeenCalled();
  });
});

describe('cas sociaux HTTP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST create returns 403 when the student belongs to another school', async () => {
    prisma.student.findFirst.mockResolvedValue(null);
    const req = {
      user: { school: SCHOOL },
      body: { studentId: 'stu-other', motif: 'orphelin', discountType: 'PERCENT', discountValue: '50' },
      ip: '127.0.0.1',
    };
    const res = mockRes();

    await createSocialCase(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(prisma.socialCase.create).not.toHaveBeenCalled();
  });

  test('POST close returns 403 for a case of another school', async () => {
    prisma.socialCase.findFirst.mockResolvedValue(null);
    const req = { user: { school: SCHOOL }, params: { id: 'case-other' }, ip: '127.0.0.1' };
    const res = mockRes();

    await closeSocialCase(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(prisma.socialCase.update).not.toHaveBeenCalled();
  });
});
