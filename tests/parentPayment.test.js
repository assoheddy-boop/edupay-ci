jest.mock('../src/config/database', () => ({
  parentStudent: { findFirst: jest.fn() },
  payment: { create: jest.fn() },
  paymentProof: { update: jest.fn() },
  school: { findFirst: jest.fn() },
  notification: { create: jest.fn() },
}));

jest.mock('../services/PaymentService', () => ({
  validateProof: jest.fn(),
}));

jest.mock('../src/utils/audit', () => ({
  logAudit: jest.fn(),
}));

const prisma = require('../src/config/database');
const { createPayment } = require('../src/controllers/parentController');

function mockRes() {
  return { redirect: jest.fn() };
}

describe('parent createPayment ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects a payment for a student not linked to the parent', async () => {
    prisma.parentStudent.findFirst.mockResolvedValue(null);
    const req = {
      user: { parentProfile: { id: 'parent-1' } },
      body: { studentId: 'stu-other', amount: '5000' },
    };
    const res = mockRes();

    await createPayment(req, res);

    expect(res.redirect).toHaveBeenCalledWith('/parent/payments?error=child');
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  test('creates a payment when the student belongs to the parent', async () => {
    prisma.parentStudent.findFirst.mockResolvedValue({ id: 'link-1' });
    prisma.payment.create.mockResolvedValue({ id: 'pay-1' });
    prisma.school.findFirst.mockResolvedValue(null);
    const req = {
      user: { parentProfile: { id: 'parent-1' } },
      body: { studentId: 'stu-1', amount: '25000', reference: 'WAVE-1' },
    };
    const res = mockRes();

    await createPayment(req, res);

    expect(prisma.payment.create).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/parent/payments?success=1');
  });
});
