const { computeClassement, formatClassRank, formatGenderRank, ordinalFr } = require('../src/services/classement');
const { parseSeries, effectiveSeries, matchesSeriesFilter, seriesLabel } = require('../src/services/series');

describe('classement filles / garçons', () => {
  const entries = [
    { id: 'f1', avg: 16, gender: 'F' },
    { id: 'm1', avg: 14, gender: 'M' },
    { id: 'f2', avg: 12, gender: 'F' },
  ];

  test('ranks in the class and among the same gender', () => {
    expect(computeClassement(entries, 'f1')).toEqual(expect.objectContaining({
      rank: 1,
      classSize: 3,
      genderRank: 1,
      genderSize: 2,
      genderGroup: 'filles',
    }));
    expect(computeClassement(entries, 'm1')).toEqual(expect.objectContaining({
      rank: 2,
      genderRank: 1,
      genderSize: 1,
      genderGroup: 'garçons',
    }));
    expect(computeClassement(entries, 'f2')).toEqual(expect.objectContaining({
      rank: 3,
      genderRank: 2,
      genderSize: 2,
    }));
  });

  test('omits gender rank when gender is missing', () => {
    const result = computeClassement([{ id: 'x', avg: 10, gender: null }], 'x');
    expect(result.rank).toBe(1);
    expect(result.genderRank).toBeNull();
    expect(result.genderGroup).toBeNull();
  });

  test('formats French rank lines', () => {
    expect(ordinalFr(1)).toBe('1er');
    expect(ordinalFr(2)).toBe('2e');
    expect(formatClassRank({ rank: 1, classSize: 32 })).toBe('1er / 32');
    expect(formatGenderRank({ genderRank: 2, genderSize: 15, genderGroup: 'filles' })).toBe('2e / 15');
  });
});

describe('lycée series', () => {
  test('parses A/C/D and empty as collège', () => {
    expect(parseSeries('a')).toBe('A');
    expect(parseSeries('C')).toBe('C');
    expect(parseSeries('')).toBeNull();
    expect(parseSeries('X')).toBeNull();
    expect(seriesLabel('D')).toBe('Série D');
  });

  test('student inherits class series unless overridden', () => {
    expect(effectiveSeries({ series: null }, { series: 'C' })).toBe('C');
    expect(effectiveSeries({ series: 'A' }, { series: 'C' })).toBe('A');
    expect(effectiveSeries({ series: null }, { series: null })).toBeNull();
  });

  test('filter keeps collège classes when no series is requested', () => {
    expect(matchesSeriesFilter({ series: null }, { series: null }, '')).toBe(true);
    expect(matchesSeriesFilter({ series: null }, { series: 'C' }, 'C')).toBe(true);
    expect(matchesSeriesFilter({ series: 'A' }, { series: 'C' }, 'C')).toBe(false);
  });
});
