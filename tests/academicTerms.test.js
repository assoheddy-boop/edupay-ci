const {
  normalizeTerm,
  formatTermLabel,
  canonicalPeriod,
  filterGradesForBulletin,
} = require('../src/services/academicTerms');

describe('academicTerms', () => {
  test('maps free-text IGEST periods to T1/T2/T3', () => {
    expect(normalizeTerm('Trimestre 1')).toBe('T1');
    expect(normalizeTerm('trim. 2')).toBe('T2');
    expect(normalizeTerm('3e trimestre')).toBe('T3');
    expect(normalizeTerm('T1')).toBe('T1');
    expect(normalizeTerm('Annuelle')).toBe('ANNUELLE');
  });

  test('leaves unknown periods in AUTRE', () => {
    expect(normalizeTerm('Examen blanc')).toBe('AUTRE');
    expect(normalizeTerm('')).toBe('AUTRE');
  });

  test('canonicalPeriod stores T1 instead of Trimestre 1', () => {
    expect(canonicalPeriod('Trimestre 1')).toBe('T1');
    expect(canonicalPeriod('Examen blanc')).toBe('Examen blanc');
  });

  test('formatTermLabel uses French trimestre names', () => {
    expect(formatTermLabel('T1')).toBe('Trimestre 1');
    expect(formatTermLabel('Trimestre 2')).toBe('Trimestre 2');
    expect(formatTermLabel('Examen blanc')).toBe('Examen blanc');
  });

  test('isolates T1 grades from T2', () => {
    const grades = [
      { subject: 'Mathématiques', period: 'Trimestre 1', value: 12, maxValue: 20 },
      { subject: 'Mathématiques', period: 'T2', value: 18, maxValue: 20 },
      { subject: 'Français', term: 'T1', period: 'T1', value: 10, maxValue: 20 },
    ];
    const t1 = filterGradesForBulletin(grades, 'T1');
    const t2 = filterGradesForBulletin(grades, 'T2');
    expect(t1).toHaveLength(2);
    expect(t2).toHaveLength(1);
    expect(t2[0].value).toBe(18);
  });

  test('annuelle keeps only T1 T2 T3, not AUTRE', () => {
    const grades = [
      { period: 'T1', value: 12, maxValue: 20 },
      { period: 'Examen blanc', value: 20, maxValue: 20 },
    ];
    expect(filterGradesForBulletin(grades, 'ANNUELLE')).toHaveLength(1);
    expect(filterGradesForBulletin(grades, 'Examen blanc')[0].value).toBe(20);
  });
});
