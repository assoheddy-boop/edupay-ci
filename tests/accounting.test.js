jest.mock('../src/config/database', () => ({
  school: { findUnique: jest.fn() },
  student: { findUnique: jest.fn() },
  accountingEntry: {
    create: jest.fn(),
    aggregate: jest.fn(),
    findMany: jest.fn(),
  },
  scholarship: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
}));

jest.mock('../services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const prisma = require('../src/config/database');
const { addEntry, getBalance, getReport } = require('../services/AccountingService');

describe('AccountingService.addEntry', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects incomplete data', async () => {
    await expect(addEntry({})).resolves.toEqual({ ok: false, error: 'data' });
  });

  test('creates an income entry', async () => {
    prisma.school.findUnique.mockResolvedValue({ id: 'school-1', name: 'EPV ECEME' });
    prisma.accountingEntry.create.mockResolvedValue({
      id: 'acc-1',
      type: 'INCOME',
      amount: 15000,
      schoolId: 'school-1',
      school: { name: 'EPV ECEME' },
    });

    const result = await addEntry({
      schoolId: 'school-1',
      type: 'INCOME',
      amount: 15000,
      description: 'Frais de scolarité',
    });

    expect(result.ok).toBe(true);
    expect(result.entry.amount).toBe(15000);
    expect(prisma.accountingEntry.create).toHaveBeenCalled();
  });
});

describe('AccountingService.getBalance / getReport', () => {
  beforeEach(() => jest.clearAllMocks());

  test('computes balance as income minus expense', async () => {
    prisma.accountingEntry.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 100000 } })
      .mockResolvedValueOnce({ _sum: { amount: 40000 } });

    await expect(getBalance('school-1')).resolves.toEqual({
      ok: true,
      income: 100000,
      expense: 40000,
      balance: 60000,
    });
  });

  test('getReport totals journal lines', async () => {
    prisma.accountingEntry.findMany.mockResolvedValue([
      { type: 'INCOME', amount: 20000, school: { name: 'A' } },
      { type: 'EXPENSE', amount: 5000, school: { name: 'A' } },
    ]);

    const result = await getReport('school-1');
    expect(result.ok).toBe(true);
    expect(result.totals).toEqual({ income: 20000, expense: 5000, balance: 15000 });
    expect(result.entries).toHaveLength(2);
  });
});
