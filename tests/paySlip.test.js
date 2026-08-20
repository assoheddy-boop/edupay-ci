const {
  buildPayslipLines,
  computePayslipTotals,
  computeBlockSubtotals,
  buildAnnualCumulsRows,
} = require('../src/services/paySlipService');
const { mergeSchoolRubriques } = require('../src/config/paySlipRubriques');
const {
  buildDisplayLines,
  formatMoneyCi,
  paySlipTableColumns,
} = require('../src/utils/paySlipLayout');

describe('paySlip calculations', () => {
  const profile = {
    baseSalary: 75000,
    sursalaire: 0,
    transportAllowance: 30000,
    taxParts: 2,
  };

  const rubriques = mergeSchoolRubriques([]);

  test('buildPayslipLines matches IGES reference structure', () => {
    const lines = buildPayslipLines({ profile, rubriques, advances: 0 });
    const base = lines.find((l) => l.code === '100');
    const anciennete = lines.find((l) => l.code === '211');
    const cnps = lines.find((l) => l.code === '810');
    const transport = lines.find((l) => l.code === '204');
    const cmu = lines.find((l) => l.code === '512');

    expect(base.gains).toBe(75000);
    expect(anciennete.gains).toBe(3000);
    expect(cnps.deductions).toBe(4725);
    expect(transport.gains).toBe(30000);
    expect(cmu.deductions).toBe(2000);
  });

  test('computePayslipTotals derives net from gains minus retenues', () => {
    const lines = buildPayslipLines({ profile, rubriques, advances: 0 });
    const totals = computePayslipTotals(lines);

    expect(totals.totalGains).toBe(108000);
    expect(totals.totalDeductions).toBeGreaterThan(0);
    expect(totals.netPay).toBe(totals.totalGains - totals.totalDeductions);
    expect(totals.netPay).toBeGreaterThan(90000);
  });

  test('computeBlockSubtotals splits blocks 1/2/3', () => {
    const lines = buildPayslipLines({ profile, rubriques, advances: 5000 });
    const blocks = computeBlockSubtotals(lines);

    expect(blocks[1].gains).toBe(78000);
    expect(blocks[2].deductions).toBeGreaterThan(0);
    expect(blocks[3].gains).toBe(30000);
    expect(blocks[3].deductions).toBeGreaterThanOrEqual(5000);
  });

  test('buildAnnualCumulsRows accumulates fiscal lines', () => {
    const lines = buildPayslipLines({ profile, rubriques, advances: 0 });
    const cumuls = buildAnnualCumulsRows(lines, { cnps: 1000, is: 500 });
    expect(cumuls.cnps).toBeGreaterThan(1000);
    expect(cumuls.brutImposable).toBeGreaterThan(75000);
  });
});

describe('paySlipLayout helpers', () => {
  test('formatMoneyCi uses French grouping', () => {
    expect(formatMoneyCi(75000)).toBe('75\u202f000');
  });

  test('paySlipTableColumns includes official headers', () => {
    const cols = paySlipTableColumns();
    expect(cols.map((c) => c.label)).toEqual([
      'CODE',
      'RUBRIQUE',
      'BASE',
      'NBRE/TAUX',
      'GAINS',
      'RETENUES',
    ]);
  });

  test('buildDisplayLines fills catalog codes even when empty', () => {
    const display = buildDisplayLines([{ code: '100', gains: 75000, base: 75000, block: 1, category: 'GAIN' }]);
    expect(display.some((r) => r.code === '110')).toBe(true);
    expect(display.find((r) => r.code === '100').gains).toBe('75\u202f000');
  });
});
