const {
  slugify,
  trimestreSlug,
  frenchMonthSlug,
  personNameSlug,
  bulletinPdfFilename,
  payslipPdfFilename,
  buildContentDisposition,
} = require('../src/utils/pdfFilename');

describe('pdfFilename helpers', () => {
  test('slugify removes accents and spaces', () => {
    expect(slugify('Kouamé Mohamed')).toBe('kouame-mohamed');
    expect(slugify('  Éléonore  ')).toBe('eleonore');
  });

  test('trimestreSlug normalizes period labels', () => {
    expect(trimestreSlug('Trimestre 1')).toBe('t1');
    expect(trimestreSlug('T2')).toBe('t2');
    expect(trimestreSlug('Annuelle')).toBe('annuelle');
  });

  test('frenchMonthSlug uses French month names', () => {
    expect(frenchMonthSlug(8, 2026)).toBe('aout-2026');
    expect(frenchMonthSlug(3, 2026)).toBe('mars-2026');
  });

  test('personNameSlug joins last and first names', () => {
    expect(personNameSlug('KOUAME', 'Mohamed')).toBe('kouame-mohamed');
    expect(personNameSlug('Kayéda', 'Warren')).toBe('kayeda-warren');
  });

  test('bulletinPdfFilename includes trimestre and student name', () => {
    expect(
      bulletinPdfFilename({
        student: { lastName: 'KOUAME', firstName: 'Mohamed' },
        period: 'Trimestre 1',
      }),
    ).toBe('bulletin-t1-kouame-mohamed.pdf');
  });

  test('payslipPdfFilename includes employee name and month', () => {
    expect(
      payslipPdfFilename({
        employee: { lastName: 'KAYEDA', firstName: 'Warren' },
        month: 8,
        year: 2026,
      }),
    ).toBe('paie-kayeda-warren-aout-2026.pdf');
  });

  test('buildContentDisposition uses ASCII filename when safe', () => {
    expect(buildContentDisposition('bulletin-t1-kouame-mohamed.pdf')).toBe(
      'attachment; filename="bulletin-t1-kouame-mohamed.pdf"',
    );
  });

  test('buildContentDisposition adds filename* for non-ASCII names', () => {
    const header = buildContentDisposition('bulletin-t1-kouamé.pdf');
    expect(header).toContain('filename="bulletin-t1-kouame.pdf"');
    expect(header).toContain("filename*=UTF-8''");
  });
});
