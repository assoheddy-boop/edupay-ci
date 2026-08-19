jest.mock('../src/config/database', () => ({
  student: { findFirst: jest.fn(), findMany: jest.fn() },
  feeType: { findFirst: jest.fn(), findMany: jest.fn() },
  payment: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  parentStudent: { findMany: jest.fn() },
}));

jest.mock('../src/services/documentPdf', () => ({
  generateReceiptPdf: jest.fn().mockResolvedValue({ pdfUrl: '/uploads/receipts/recu-pay-caisse.pdf' }),
}));

jest.mock('../services/NotificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('../src/utils/modules', () => ({
  isEnabled: jest.fn(() => true),
  getModuleMap: jest.fn().mockResolvedValue({ accounting: { enabled: true } }),
  initFinanceDefaults: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/AccountingService', () => ({
  recordValidatedPayment: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('../services/cache', () => ({
  delCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/utils/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../src/config/database');
const { generateReceiptPdf } = require('../src/services/documentPdf');
const { recordValidatedPayment } = require('../services/AccountingService');
const {
  createCaissePayment,
  getCaisseTicket,
  normalizeMethod,
  methodLabel,
  summarizeTill,
} = require('../src/services/caisseService');
const { createCaisseEntry, caisseTicket } = require('../src/controllers/schoolController');

const SCHOOL = { id: 'school-1', name: 'IGEST Yopougon', logoUrl: '/img/igest.png' };
const OTHER_SCHOOL_ID = 'school-other';
const STUDENT = {
  id: 'stu-1',
  schoolId: 'school-1',
  firstName: 'Kofi',
  lastName: 'Yao',
  matricule: 'IG-DEMO-001',
  class: { name: '6e A' },
};
const FEE = { id: 'fee-1', name: 'Scolarité Trimestre 1', amount: 75000, schoolId: 'school-1' };
const PAYMENT = {
  id: 'pay-caisse-1',
  amount: 75000,
  status: 'VALIDATED',
  source: 'CAISSE',
  method: 'CASH',
  studentId: 'stu-1',
  feeTypeId: 'fee-1',
  reference: 'CAISSE-token1',
  note: null,
  validatedAt: new Date('2026-08-19T10:00:00Z'),
  createdAt: new Date('2026-08-19T10:00:00Z'),
  receiptUrl: '/uploads/receipts/recu-pay-caisse.pdf',
  student: STUDENT,
  feeType: FEE,
};

function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    render: jest.fn().mockReturnThis(),
    redirect: jest.fn(),
  };
  return res;
}

describe('caisse methods', () => {
  test('defaults to Espèces / CASH', () => {
    expect(normalizeMethod()).toBe('CASH');
    expect(normalizeMethod('espèces')).toBe('CASH');
    expect(methodLabel('CASH')).toBe('Espèces');
    expect(methodLabel('ORANGE_MONEY')).toBe('Orange Money');
  });

  test('summarizeTill totals by method', () => {
    const totals = summarizeTill([
      { amount: 10000, method: 'CASH' },
      { amount: 5000, method: 'WAVE' },
      { amount: 5000, method: 'CASH' },
    ]);
    expect(totals.count).toBe(3);
    expect(totals.total).toBe(20000);
    expect(totals.byMethod.CASH).toBe(15000);
    expect(totals.byMethod.WAVE).toBe(5000);
  });
});

describe('createCaissePayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.parentStudent.findMany.mockResolvedValue([]);
    prisma.payment.update.mockResolvedValue(PAYMENT);
    generateReceiptPdf.mockResolvedValue({ pdfUrl: PAYMENT.receiptUrl });
    recordValidatedPayment.mockResolvedValue({ ok: true });
  });

  test('creates a VALIDATED cash payment and posts accounting', async () => {
    prisma.student.findFirst.mockResolvedValue(STUDENT);
    prisma.feeType.findFirst.mockResolvedValue(FEE);
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.payment.create.mockResolvedValue(PAYMENT);

    const result = await createCaissePayment({
      school: SCHOOL,
      body: {
        studentId: STUDENT.id,
        feeTypeId: FEE.id,
        amount: '75000',
        method: 'CASH',
        idempotencyKey: 'token1',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(prisma.payment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        studentId: STUDENT.id,
        feeTypeId: FEE.id,
        amount: 75000,
        status: 'VALIDATED',
        source: 'CAISSE',
        method: 'CASH',
        reference: 'CAISSE-token1',
      }),
    }));
    expect(generateReceiptPdf).toHaveBeenCalled();
    expect(recordValidatedPayment).toHaveBeenCalledWith(expect.objectContaining({
      schoolId: SCHOOL.id,
      payment: expect.objectContaining({ id: PAYMENT.id, method: 'CASH' }),
    }));
  });

  test('does not duplicate on the same idempotency key', async () => {
    prisma.student.findFirst.mockResolvedValue(STUDENT);
    prisma.feeType.findFirst.mockResolvedValue(FEE);
    prisma.payment.findFirst.mockResolvedValue(PAYMENT);

    const result = await createCaissePayment({
      school: SCHOOL,
      body: {
        studentId: STUDENT.id,
        feeTypeId: FEE.id,
        amount: '75000',
        method: 'CASH',
        idempotencyKey: 'token1',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.duplicate).toBe(true);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  test('refuses a student from another school', async () => {
    prisma.student.findFirst.mockResolvedValue(null);

    const result = await createCaissePayment({
      school: SCHOOL,
      body: {
        studentId: 'stu-other',
        feeTypeId: FEE.id,
        amount: '75000',
        method: 'CASH',
      },
    });

    expect(result).toEqual({ ok: false, error: 'forbidden', status: 403 });
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
});

describe('caisse ticket HTTP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET ticket returns 200 for the school payment', async () => {
    prisma.payment.findFirst.mockResolvedValue(PAYMENT);
    const req = { user: { school: SCHOOL }, params: { id: PAYMENT.id } };
    const res = mockRes();

    await caisseTicket(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.render).toHaveBeenCalledWith('school/caisse-ticket', expect.objectContaining({
      payment: PAYMENT,
      school: SCHOOL,
    }));
  });

  test('GET ticket returns 403 for another school', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);
    const req = { user: { school: SCHOOL }, params: { id: 'pay-other' } };
    const res = mockRes();

    await caisseTicket(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.render).toHaveBeenCalledWith('error', expect.objectContaining({
      message: 'Accès refusé',
    }));
    expect(prisma.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'pay-other',
        source: 'CAISSE',
        student: { schoolId: SCHOOL.id },
      }),
    }));
  });

  test('POST caisse returns 403 when the student belongs to another school', async () => {
    prisma.student.findFirst.mockResolvedValue(null);
    const req = {
      user: { school: SCHOOL },
      body: { studentId: 'stu-other', feeTypeId: FEE.id, amount: '75000' },
      ip: '127.0.0.1',
    };
    const res = mockRes();

    await createCaisseEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
});

describe('getCaisseTicket', () => {
  test('scopes the ticket to the requesting school', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);
    const result = await getCaisseTicket(OTHER_SCHOOL_ID, PAYMENT.id);
    expect(result.status).toBe(403);
    expect(prisma.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ student: { schoolId: OTHER_SCHOOL_ID } }),
    }));
  });
});
