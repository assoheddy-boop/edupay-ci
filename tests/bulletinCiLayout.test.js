const {
  formatGradeCi,
  formatGradeCiOrDash,
  termTitleCi,
  formatRankCi,
  computeTotalsRow,
  buildTableRowValues,
  computeClassStats,
  splitTeacherName,
  gradesTableColumns,
  columnOffsets,
  CONTENT_WIDTH,
} = require('../src/utils/bulletinCiLayout');

describe('bulletinCiLayout helpers', () => {
  test('formatGradeCi uses comma decimals', () => {
    expect(formatGradeCi(12.5)).toBe('12,50');
    expect(formatGradeCi(12.777)).toBe('12,78');
    expect(formatGradeCiOrDash(null)).toBe('—');
  });

  test('formatGradeCi pads lowest average like reference', () => {
    expect(formatGradeCiOrDash(8, { pad: true })).toBe('8,00');
  });

  test('termTitleCi matches official labels', () => {
    expect(termTitleCi('T1')).toBe('BULLETIN DE NOTES DU PREMIER TRIMESTRE');
    expect(termTitleCi('T2')).toBe('BULLETIN DE NOTES DU DEUXIEME TRIMESTRE');
    expect(termTitleCi('T3')).toBe('BULLETIN DE NOTES DU TROISIEME TRIMESTRE');
  });

  test('formatRankCi uses French ordinals', () => {
    expect(formatRankCi(1)).toBe('1er');
    expect(formatRankCi(2)).toBe('2e');
    expect(formatRankCi(4)).toBe('4e');
  });

  test('computeTotalsRow sums coefficients and weighted points', () => {
    const rows = [
      { subject: 'Français', coefficient: 4, average: 13 },
      { subject: 'Anglais', coefficient: 1, average: 15 },
    ];
    const totals = computeTotalsRow(rows, 13.4, 2);
    expect(totals.discipline).toBe('TOTAUX TRIMESTRE');
    expect(totals.coef).toBe('5');
    expect(totals.moyCoef).toBe('67,00');
    expect(totals.moy).toBe('13,40');
    expect(totals.rang).toBe('2e');
  });

  test('buildTableRowValues maps subject row to grid columns', () => {
    const values = buildTableRowValues({
      subject: 'Mathématiques',
      coefficient: 4,
      average: 12.5,
      comment: 'Bon travail',
      teacherName: 'M. KONAN A.',
    }, { Mathématiques: 1 });
    expect(values.discipline).toBe('Mathématiques');
    expect(values.moy).toBe('12,50');
    expect(values.coef).toBe('4');
    expect(values.moyCoef).toBe('50,00');
    expect(values.rang).toBe('1er');
    expect(values.appreciation).toBe('Bon travail');
  });

  test('splitTeacherName separates nom and prenom', () => {
    expect(splitTeacherName('M. KONAN A.')).toEqual({ nom: 'M. KONAN', prenom: 'A.' });
  });

  test('computeClassStats averages class mates', () => {
    const stats = computeClassStats([
      { avg: 10 },
      { avg: 12 },
      { avg: 8 },
    ]);
    expect(stats.classAverage).toBe(10);
    expect(stats.highest).toBe(12);
    expect(stats.lowest).toBe(8);
  });

  test('grades table columns span full content width', () => {
    const cols = gradesTableColumns();
    const sum = cols.reduce((s, c) => s + c.width, 0);
    expect(sum).toBe(CONTENT_WIDTH);
    const offsets = columnOffsets(cols);
    expect(offsets).toHaveLength(8);
    expect(offsets[0].label).toBe('DISCIPLINE');
    expect(offsets[7].label).toBe('Appréciations et signature');
  });
});
