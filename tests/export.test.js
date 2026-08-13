const {
  generateBulletinPDF,
  generatePayrollPDF,
  generateStatsExcel,
  parseMonth,
} = require('../services/export');

describe('export.parseMonth', () => {
  test('parses YYYY-MM', () => {
    expect(parseMonth('2026-08')).toEqual({ month: 8, year: 2026 });
  });

  test('parses object', () => {
    expect(parseMonth({ month: 3, year: 2026 })).toEqual({ month: 3, year: 2026 });
  });
});

describe('export service guards', () => {
  test('generateBulletinPDF rejects missing studentId', async () => {
    await expect(generateBulletinPDF()).resolves.toEqual({ ok: false, error: 'student' });
  });

  test('generatePayrollPDF rejects missing teacherId', async () => {
    await expect(generatePayrollPDF()).resolves.toEqual({ ok: false, error: 'teacher' });
  });

  test('generateStatsExcel rejects missing schoolId', async () => {
    await expect(generateStatsExcel()).resolves.toEqual({ ok: false, error: 'school' });
  });
});
