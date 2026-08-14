jest.mock('../src/config/database', () => ({
  student: { findUnique: jest.fn(), update: jest.fn() },
  parentStudent: { findFirst: jest.fn() },
  school: { findUnique: jest.fn() },
  class: { findFirst: jest.fn() },
  transferRequest: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  user: { findMany: jest.fn() },
  notification: { create: jest.fn() },
  $transaction: jest.fn(),
}));

jest.mock('../services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../src/config/socket', () => ({
  getIo: jest.fn(() => null),
}));

const prisma = require('../src/config/database');
const {
  requestTransfer,
  approveTransfer,
  rejectTransfer,
  completeTransfer,
  getTransferStats,
} = require('../services/TransferService');

function mockTransfer(overrides = {}) {
  return {
    id: 'tr-1',
    status: 'PENDING',
    studentId: 'stu-1',
    fromSchoolId: 'school-a',
    toSchoolId: 'school-b',
    requestedById: 'parent-1',
    targetClassId: null,
    student: { id: 'stu-1', firstName: 'Koffi', lastName: 'Yao', class: { id: 'class-a', level: 'CE1', name: 'CE1 A' } },
    fromSchool: { id: 'school-a', name: 'EPV Fatoumaba', adminId: 'admin-a' },
    toSchool: { id: 'school-b', name: 'EPV ECEME', adminId: 'admin-b' },
    requestedBy: { id: 'parent-1', firstName: 'Awa', lastName: 'Koné' },
    ...overrides,
  };
}

describe('TransferService.requestTransfer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findMany.mockResolvedValue([{ id: 'super-1' }]);
    prisma.notification.create.mockResolvedValue({ id: 'n-1', createdAt: new Date() });
  });

  test('rejects incomplete data', async () => {
    await expect(requestTransfer({})).resolves.toEqual({ ok: false, error: 'data' });
  });

  test('rejects a student not linked to the parent', async () => {
    prisma.student.findUnique.mockResolvedValue({ id: 'stu-1', schoolId: 'school-a' });
    prisma.parentStudent.findFirst.mockResolvedValue(null);

    const result = await requestTransfer({
      studentId: 'stu-1',
      toSchoolId: 'school-b',
      requestedById: 'parent-1',
      parentProfileId: 'pp-1',
    });

    expect(result).toEqual({ ok: false, error: 'parent' });
  });

  test('creates a pending transfer and notifies parties', async () => {
    prisma.student.findUnique.mockResolvedValue({
      id: 'stu-1',
      firstName: 'Koffi',
      lastName: 'Yao',
      schoolId: 'school-a',
      gender: 'M',
      class: { level: 'CE1' },
    });
    prisma.parentStudent.findFirst.mockResolvedValue({ id: 'link-1' });
    prisma.school.findUnique.mockResolvedValue({ id: 'school-b', name: 'EPV ECEME', adminId: 'admin-b' });
    prisma.transferRequest.findFirst.mockResolvedValue(null);
    prisma.transferRequest.create.mockResolvedValue(mockTransfer({ gender: 'M' }));

    const result = await requestTransfer({
      studentId: 'stu-1',
      toSchoolId: 'school-b',
      reason: 'Déménagement',
      requestedById: 'parent-1',
      parentProfileId: 'pp-1',
    });

    expect(result.ok).toBe(true);
    expect(result.transfer.status).toBe('PENDING');
    expect(prisma.transferRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gender: 'M' }),
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalled();
  });

  test('accepts positional requestTransfer(studentId, toSchoolId)', async () => {
    prisma.student.findUnique.mockResolvedValue({
      id: 'stu-1',
      firstName: 'Koffi',
      lastName: 'Yao',
      schoolId: 'school-a',
      class: { level: 'CE1' },
    });
    prisma.parentStudent.findFirst.mockResolvedValue({
      id: 'link-1',
      parent: { userId: 'parent-1' },
    });
    prisma.school.findUnique.mockResolvedValue({ id: 'school-b', name: 'EPV ECEME', adminId: 'admin-b' });
    prisma.transferRequest.findFirst.mockResolvedValue(null);
    prisma.transferRequest.create.mockResolvedValue(mockTransfer());

    const result = await requestTransfer('stu-1', 'school-b');
    expect(result.ok).toBe(true);
    expect(prisma.transferRequest.create).toHaveBeenCalled();
  });
});

describe('TransferService.approveTransfer / rejectTransfer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findMany.mockResolvedValue([{ id: 'super-1' }]);
    prisma.notification.create.mockResolvedValue({ id: 'n-1', createdAt: new Date() });
  });

  test('only the destination school can approve', async () => {
    prisma.transferRequest.findUnique.mockResolvedValue(mockTransfer());
    await expect(approveTransfer({ id: 'tr-1', schoolId: 'school-a' })).resolves.toEqual({
      ok: false,
      error: 'forbidden',
    });
  });

  test('approves a pending request', async () => {
    prisma.transferRequest.findUnique.mockResolvedValue(mockTransfer());
    prisma.class.findFirst.mockResolvedValue({ id: 'class-b', schoolId: 'school-b' });
    prisma.transferRequest.update.mockResolvedValue(mockTransfer({ status: 'APPROVED', targetClassId: 'class-b' }));

    const result = await approveTransfer({ id: 'tr-1', schoolId: 'school-b', classId: 'class-b' });
    expect(result.ok).toBe(true);
    expect(result.transfer.status).toBe('APPROVED');
  });

  test('rejects a pending request', async () => {
    prisma.transferRequest.findUnique.mockResolvedValue(mockTransfer());
    prisma.transferRequest.update.mockResolvedValue(mockTransfer({ status: 'REJECTED' }));

    const result = await rejectTransfer({ id: 'tr-1', schoolId: 'school-b' });
    expect(result.ok).toBe(true);
    expect(result.transfer.status).toBe('REJECTED');
  });
});

describe('TransferService.completeTransfer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findMany.mockResolvedValue([{ id: 'super-1' }]);
    prisma.notification.create.mockResolvedValue({ id: 'n-1', createdAt: new Date() });
  });

  test('refuses a request that is not approved', async () => {
    prisma.transferRequest.findUnique.mockResolvedValue(mockTransfer({ status: 'PENDING' }));
    await expect(completeTransfer({ id: 'tr-1' })).resolves.toEqual({ ok: false, error: 'status' });
  });

  test('moves the student to the destination school', async () => {
    const approved = mockTransfer({ status: 'APPROVED', targetClassId: 'class-b' });
    prisma.transferRequest.findUnique
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce({ ...approved, status: 'COMPLETED' });
    prisma.class.findFirst.mockResolvedValue({ id: 'class-b', schoolId: 'school-b' });
    prisma.student.update.mockResolvedValue({ id: 'stu-1', schoolId: 'school-b', classId: 'class-b' });
    prisma.transferRequest.update.mockResolvedValue({ ...approved, status: 'COMPLETED' });
    prisma.$transaction.mockImplementation(async (ops) => Promise.all(ops));

    const result = await completeTransfer({ id: 'tr-1', classId: 'class-b' });
    expect(result.ok).toBe(true);
    expect(result.transfer.status).toBe('COMPLETED');
    expect(prisma.student.update).toHaveBeenCalledWith({
      where: { id: 'stu-1' },
      data: { schoolId: 'school-b', classId: 'class-b' },
    });
  });
});

describe('TransferService.getTransferStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('counts completed transfers from a school by gender', async () => {
    prisma.transferRequest.findMany.mockResolvedValue([
      { gender: 'M', student: { gender: 'M' } },
      { gender: null, student: { gender: 'F' } },
      { gender: 'M', student: { gender: 'F' } },
      { gender: null, student: { gender: null } },
    ]);

    const result = await getTransferStats('school-a');

    expect(prisma.transferRequest.findMany).toHaveBeenCalledWith({
      where: { status: 'COMPLETED', fromSchoolId: 'school-a' },
      select: {
        gender: true,
        student: { select: { gender: true } },
      },
    });
    expect(result).toEqual({
      boysTransferred: 2,
      girlsTransferred: 1,
      totalTransferred: 4,
    });
  });

  test('aggregates all schools when schoolId is omitted', async () => {
    prisma.transferRequest.findMany.mockResolvedValue([
      { gender: 'F', student: { gender: 'F' } },
    ]);

    const result = await getTransferStats();

    expect(prisma.transferRequest.findMany).toHaveBeenCalledWith({
      where: { status: 'COMPLETED' },
      select: {
        gender: true,
        student: { select: { gender: true } },
      },
    });
    expect(result).toEqual({
      boysTransferred: 0,
      girlsTransferred: 1,
      totalTransferred: 1,
    });
  });
});
