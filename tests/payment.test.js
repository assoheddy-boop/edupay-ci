jest.mock('../src/config/database', () => ({
  student: { findUnique: jest.fn() },
  paymentProof: { create: jest.fn() },
  payment: { findMany: jest.fn() },
}));

jest.mock('../services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn(),
    promises: {
      ...actual.promises,
      writeFile: jest.fn().mockResolvedValue(undefined),
      unlink: jest.fn().mockResolvedValue(undefined),
    },
  };
});

const prisma = require('../src/config/database');
const { validateProof, getPendingPayments } = require('../services/PaymentService');

describe('PaymentService.validateProof', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects an invalid file (wrong MIME type)', async () => {
    const result = await validateProof({
      mimetype: 'application/zip',
      originalname: 'preuve.zip',
      size: 1200,
      buffer: Buffer.from('PK'),
    }, 'stu-1');

    expect(result).toEqual({ ok: false, error: 'mime' });
    expect(prisma.paymentProof.create).not.toHaveBeenCalled();
  });

  test('rejects a missing file', async () => {
    await expect(validateProof(null, 'stu-1')).resolves.toEqual({ ok: false, error: 'file' });
  });

  test('accepts a valid JPEG proof', async () => {
    prisma.student.findUnique.mockResolvedValue({ id: 'stu-1', firstName: 'Koffi' });
    prisma.paymentProof.create.mockResolvedValue({
      id: 'proof-1',
      hash: 'abc123',
      fileUrl: '/uploads/payments/abc123.jpg',
      studentId: 'stu-1',
    });

    const result = await validateProof({
      mimetype: 'image/jpeg',
      originalname: 'wave.jpg',
      size: 256,
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    }, 'stu-1');

    expect(result.ok).toBe(true);
    expect(result.proof.id).toBe('proof-1');
    expect(result.fileUrl).toMatch(/\/uploads\/payments\//);
    expect(result.hash).toEqual(expect.any(String));
    expect(prisma.paymentProof.create).toHaveBeenCalled();
  });
});

describe('PaymentService.getPendingPayments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns pending payments for a fictional school', async () => {
    const schoolId = 'school-fictive-ci';
    const pending = [
      { id: 'pay-1', status: 'PENDING', amount: 75000, studentId: 'stu-1' },
      { id: 'pay-2', status: 'PENDING', amount: 25000, studentId: 'stu-2' },
    ];
    prisma.payment.findMany.mockResolvedValue(pending);

    const result = await getPendingPayments(schoolId);

    expect(result).toEqual(pending);
    expect(result).toHaveLength(2);
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PENDING', student: { schoolId } },
      }),
    );
  });

  test('returns an empty list when the fictional school has no pending payments', async () => {
    prisma.payment.findMany.mockResolvedValue([]);
    await expect(getPendingPayments('school-vide')).resolves.toEqual([]);
  });
});
