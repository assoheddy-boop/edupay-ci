jest.mock('../src/config/database', () => ({
  school: { findUnique: jest.fn() },
  student: { findUnique: jest.fn() },
  accountingEntry: {
    create: jest.fn(),
    aggregate: jest.fn(),
    findMany: jest.fn(),
  },
  scholarship: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  financeTransaction: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  financeAccount: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), createMany: jest.fn() },
  expenseCategory: { findFirst: jest.fn(), findMany: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn(),
}));

jest.mock('../services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const prisma = require('../src/config/database');
const {
  addEntry,
  getBalance,
  getReport,
  getSchoolReport,
  recordMovement,
  recordValidatedPayment,
  inferAccountType,
  inferIncomeCategory,
  parsePeriod,
  schoolYearRange,
  accountTypeLabel,
  summarizeTransactions,
} = require('../services/AccountingService');
const { initFinanceDefaults } = require('../src/utils/modules');
const { generateAccountingReportPdf } = require('../services/export');

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

describe('accounting helpers (CI director)', () => {
  test('inferAccountType maps Wave, OM, caisse and banque', () => {
    expect(inferAccountType({ reference: 'WAVE-9921' })).toBe('WAVE');
    expect(inferAccountType({ reference: 'OM-441' })).toBe('ORANGE_MONEY');
    expect(inferAccountType({ note: 'Orange Money Aya' })).toBe('ORANGE_MONEY');
    expect(inferAccountType({ description: 'Versement espèces caisse' })).toBe('CASH');
    expect(inferAccountType({ reference: 'virement banque' })).toBe('BANK');
    expect(inferAccountType({})).toBe('WAVE');
  });

  test('inferAccountType prefers payment method over CAISSE reference', () => {
    expect(inferAccountType({ method: 'CASH' })).toBe('CASH');
    expect(inferAccountType({ method: 'WAVE', reference: 'CAISSE-abc' })).toBe('WAVE');
    expect(inferAccountType({ method: 'ORANGE_MONEY' })).toBe('ORANGE_MONEY');
    expect(inferAccountType({ method: 'BANK' })).toBe('BANK');
  });

  test('inferIncomeCategory maps scolarité, cantine, extras', () => {
    expect(inferIncomeCategory('Scolarité T1')).toBe('Scolarité');
    expect(inferIncomeCategory('Cantine T1')).toBe('Cantine');
    expect(inferIncomeCategory('Activité football')).toBe('Extras');
    expect(inferIncomeCategory(null)).toBe('Scolarité');
  });

  test('schoolYearRange uses septembre → août', () => {
    const range = schoolYearRange('2025-2026');
    expect(range.start).toEqual(new Date(2025, 8, 1));
    expect(range.end.getFullYear()).toBe(2026);
    expect(range.end.getMonth()).toBe(7);
    expect(schoolYearRange('nope')).toBeNull();
  });

  test('parsePeriod month vs school year', () => {
    const month = parsePeriod({ month: '2026-03', view: 'month' });
    expect(month.view).toBe('month');
    expect(month.label).toBe('03/2026');
    expect(month.start).toEqual(new Date(2026, 2, 1));

    const year = parsePeriod({ schoolYear: '2025-2026', view: 'year' });
    expect(year.view).toBe('year');
    expect(year.label).toContain('2025-2026');
    expect(year.start).toEqual(new Date(2025, 8, 1));
  });

  test('accountTypeLabel is French', () => {
    expect(accountTypeLabel('CASH')).toBe('Caisse (espèces)');
    expect(accountTypeLabel('ORANGE_MONEY')).toBe('Orange Money');
  });

  test('summarizeTransactions splits recettes and dépenses', () => {
    const summary = summarizeTransactions([
      { type: 'INCOME', amount: 25000, category: { id: 'c1', name: 'Scolarité', kind: 'INCOME' }, account: { id: 'a1', name: 'Wave', type: 'WAVE' } },
      { type: 'EXPENSE', amount: 8000, category: { id: 'c2', name: 'Fournitures', kind: 'EXPENSE' }, account: { id: 'a2', name: 'Espèces', type: 'CASH' } },
    ]);
    expect(summary.totals).toEqual({ totalIn: 25000, totalOut: 8000, net: 17000 });
    expect(summary.byCategory).toHaveLength(2);
    expect(summary.byAccount).toHaveLength(2);
  });
});

describe('AccountingService.recordMovement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
  });

  test('rejects invalid amount', async () => {
    await expect(recordMovement({
      schoolId: 'school-1', type: 'INCOME', amount: 0, accountId: 'acc-1', description: 'x',
    })).resolves.toEqual({ ok: false, error: 'amount' });
  });

  test('creates finance line, updates balance, dual-writes journal', async () => {
    prisma.financeTransaction.findFirst.mockResolvedValue(null);
    prisma.financeAccount.findFirst.mockResolvedValue({ id: 'acc-wave', schoolId: 'school-1', type: 'WAVE' });
    prisma.expenseCategory.findFirst.mockResolvedValue({ id: 'cat-1', name: 'Scolarité', kind: 'INCOME' });
    prisma.financeTransaction.create.mockResolvedValue({ id: 'tx-1', amount: 25000 });
    prisma.financeAccount.update.mockResolvedValue({});
    prisma.accountingEntry.create.mockResolvedValue({ id: 'ae-1' });

    const result = await recordMovement({
      schoolId: 'school-1',
      type: 'INCOME',
      amount: 25000,
      accountId: 'acc-wave',
      categoryId: 'cat-1',
      description: 'Paiement Awa Koné',
      paymentId: 'pay-1',
      source: 'PAYMENT',
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    expect(prisma.financeTransaction.create).toHaveBeenCalled();
    expect(prisma.financeAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-wave' },
      data: { balance: { increment: 25000 } },
    });
    expect(prisma.accountingEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'INCOME',
        amount: 25000,
        paymentId: 'pay-1',
        source: 'PAYMENT',
        category: 'Scolarité',
        accountType: 'WAVE',
      }),
    }));
  });

  test('skips duplicate paymentId', async () => {
    prisma.financeTransaction.findFirst.mockResolvedValue({ id: 'tx-existing', paymentId: 'pay-1' });

    const result = await recordMovement({
      schoolId: 'school-1',
      type: 'INCOME',
      amount: 25000,
      accountId: 'acc-wave',
      description: 'Paiement',
      paymentId: 'pay-1',
    });

    expect(result).toEqual({
      ok: true,
      skipped: true,
      transaction: { id: 'tx-existing', paymentId: 'pay-1' },
    });
    expect(prisma.financeTransaction.create).not.toHaveBeenCalled();
  });

  test('rejects account from another school', async () => {
    prisma.financeAccount.findFirst.mockResolvedValue(null);

    const result = await recordMovement({
      schoolId: 'school-1',
      type: 'EXPENSE',
      amount: 5000,
      accountId: 'foreign',
      description: 'Loyer',
    });

    expect(result).toEqual({ ok: false, error: 'account' });
  });
});

describe('AccountingService.recordValidatedPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
  });

  test('posts scolarité onto Orange Money when reference is OM', async () => {
    prisma.financeAccount.findMany.mockResolvedValue([
      { id: 'acc-wave', type: 'WAVE' },
      { id: 'acc-om', type: 'ORANGE_MONEY' },
    ]);
    prisma.expenseCategory.findFirst.mockResolvedValue({ id: 'cat-sco', name: 'Scolarité', kind: 'INCOME' });
    prisma.financeTransaction.findFirst.mockResolvedValue(null);
    prisma.financeAccount.findFirst.mockResolvedValue({ id: 'acc-om', schoolId: 'school-1', type: 'ORANGE_MONEY' });
    prisma.financeTransaction.create.mockResolvedValue({ id: 'tx-1' });
    prisma.financeAccount.update.mockResolvedValue({});
    prisma.accountingEntry.create.mockResolvedValue({ id: 'ae-1' });

    const result = await recordValidatedPayment({
      schoolId: 'school-1',
      payment: {
        id: 'pay-9',
        amount: 45000,
        reference: 'OM-7788',
        feeType: { name: 'Scolarité T1' },
        student: { firstName: 'Koffi', lastName: 'Yao' },
      },
    });

    expect(result.ok).toBe(true);
    expect(prisma.financeAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 'acc-om', schoolId: 'school-1' },
    });
    expect(prisma.financeTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'INCOME',
        amount: 45000,
        accountId: 'acc-om',
        paymentId: 'pay-9',
        categoryId: 'cat-sco',
      }),
    }));
  });

  test('posts caisse espèces onto the CASH account', async () => {
    prisma.financeAccount.findMany.mockResolvedValue([
      { id: 'acc-wave', type: 'WAVE' },
      { id: 'acc-cash', type: 'CASH' },
    ]);
    prisma.expenseCategory.findFirst.mockResolvedValue({ id: 'cat-sco', name: 'Scolarité', kind: 'INCOME' });
    prisma.financeTransaction.findFirst.mockResolvedValue(null);
    prisma.financeAccount.findFirst.mockResolvedValue({ id: 'acc-cash', schoolId: 'school-1', type: 'CASH' });
    prisma.financeTransaction.create.mockResolvedValue({ id: 'tx-cash' });
    prisma.financeAccount.update.mockResolvedValue({});
    prisma.accountingEntry.create.mockResolvedValue({ id: 'ae-cash' });

    const result = await recordValidatedPayment({
      schoolId: 'school-1',
      payment: {
        id: 'pay-caisse',
        amount: 25000,
        method: 'CASH',
        source: 'CAISSE',
        reference: 'CAISSE-token',
        feeType: { name: 'Scolarité T1' },
        student: { firstName: 'Awa', lastName: 'Kouassi' },
      },
    });

    expect(result.ok).toBe(true);
    expect(prisma.financeAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 'acc-cash', schoolId: 'school-1' },
    });
  });
});

describe('AccountingService.getSchoolReport', () => {
  beforeEach(() => jest.clearAllMocks());

  test('totals recettes and dépenses for the month', async () => {
    prisma.financeTransaction.findMany.mockResolvedValue([
      { type: 'INCOME', amount: 80000, createdAt: new Date(), category: { name: 'Scolarité', kind: 'INCOME' }, account: { name: 'Wave', type: 'WAVE' } },
      { type: 'EXPENSE', amount: 30000, createdAt: new Date(), category: { name: 'Salaires', kind: 'EXPENSE' }, account: { name: 'Banque', type: 'BANK' } },
    ]);

    const result = await getSchoolReport('school-1', { month: '2026-08', view: 'month' });
    expect(result.ok).toBe(true);
    expect(result.totals).toEqual({ totalIn: 80000, totalOut: 30000, net: 50000 });
    expect(result.period.label).toBe('08/2026');
    expect(prisma.financeTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ schoolId: 'school-1' }),
    }));
  });
});

describe('initFinanceDefaults', () => {
  beforeEach(() => jest.clearAllMocks());

  test('adds missing Banque account and income categories', async () => {
    prisma.financeAccount.findMany.mockResolvedValue([
      { type: 'WAVE' }, { type: 'ORANGE_MONEY' }, { type: 'CASH' },
    ]);
    prisma.expenseCategory.findMany.mockResolvedValue([
      { name: 'Salaires', kind: 'EXPENSE' },
      { name: 'Loyer & charges', kind: 'EXPENSE' },
      { name: 'Fournitures', kind: 'EXPENSE' },
      { name: 'Cantine', kind: 'EXPENSE' },
      { name: 'Transport', kind: 'EXPENSE' },
      { name: 'Autre', kind: 'EXPENSE' },
    ]);

    await initFinanceDefaults('school-1');

    expect(prisma.financeAccount.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ schoolId: 'school-1', type: 'BANK', name: 'Banque' })],
    });
    const catCall = prisma.expenseCategory.createMany.mock.calls[0][0];
    expect(catCall.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Scolarité', kind: 'INCOME' }),
      expect.objectContaining({ name: 'Cantine', kind: 'INCOME' }),
      expect.objectContaining({ name: 'Extras', kind: 'INCOME' }),
    ]));
  });
});

describe('generateAccountingReportPdf', () => {
  test('rejects missing school', async () => {
    await expect(generateAccountingReportPdf({})).resolves.toEqual({ ok: false, error: 'school' });
  });
});
