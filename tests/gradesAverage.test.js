const {
  computeAverage,
  computeWeightedAverage,
  computeAnnuelleAverage,
  getCoefficient,
  computeSubjectRows,
} = require('../src/services/gradesAverage');
const { filterGradesForBulletin } = require('../src/services/academicTerms');

describe('gradesAverage weighted formula', () => {
  test('uses school-configurable collège CI defaults (Maths 4, Français 3)', () => {
    expect(getCoefficient('Mathématiques')).toBe(4);
    expect(getCoefficient('Français')).toBe(3);
    expect(getCoefficient('EPS')).toBe(1);
    expect(getCoefficient('Mathématiques', { Mathématiques: 5 })).toBe(5);
    expect(getCoefficient('Mathématiques', {})).toBe(4);
  });

  test('moyenne = Σ(note × coef) / Σ(coef), not arithmetic mean', () => {
    const grades = [
      { subject: 'Mathématiques', value: 16, maxValue: 20 },
      { subject: 'EPS', value: 10, maxValue: 20 },
    ];
    // arithmetic would be 13; weighted (16*4 + 10*1) / 5 = 14.8
    expect(computeAverage(grades)).toBe(14.8);
    expect(computeWeightedAverage(grades)).toBe(14.8);
  });

  test('averages several notes in the same subject before applying the coefficient', () => {
    const grades = [
      { subject: 'Mathématiques', value: 12, maxValue: 20 },
      { subject: 'Mathématiques', value: 16, maxValue: 20 },
      { subject: 'Français', value: 10, maxValue: 20 },
    ];
    // Maths 14 × 4 + Français 10 × 3 = 86 / 7 = 12.29
    expect(computeAverage(grades)).toBe(12.29);
    const rows = computeSubjectRows(grades);
    expect(rows.find((r) => r.subject === 'Mathématiques').average).toBe(14);
  });

  test('normalizes notes that are not /20', () => {
    const grades = [
      { subject: 'Mathématiques', value: 8, maxValue: 10 },
      { subject: 'EPS', value: 5, maxValue: 10 },
    ];
    // (16*4 + 10*1) / 5 = 14.8
    expect(computeAverage(grades)).toBe(14.8);
  });

  test('T1 moyenne ignores T2 grades', () => {
    const grades = [
      { subject: 'Mathématiques', period: 'Trimestre 1', value: 8, maxValue: 20, studentId: 's1' },
      { subject: 'Mathématiques', period: 'T2', value: 20, maxValue: 20, studentId: 's1' },
    ];
    expect(computeAverage(filterGradesForBulletin(grades, 'T1'))).toBe(8);
    expect(computeAverage(filterGradesForBulletin(grades, 'T2'))).toBe(20);
  });

  test('annuelle is the average of term weighted averages', () => {
    const grades = [
      { subject: 'Mathématiques', period: 'T1', value: 10, maxValue: 20 },
      { subject: 'EPS', period: 'T1', value: 10, maxValue: 20 },
      { subject: 'Mathématiques', period: 'T2', value: 20, maxValue: 20 },
      { subject: 'EPS', period: 'T2', value: 20, maxValue: 20 },
    ];
    // T1 = (10*4 + 10*1)/5 = 10; T2 = 20; annuelle = 15
    expect(computeAnnuelleAverage(grades)).toBe(15);
  });

  test('cohort moyenne averages each student weighted moyenne', () => {
    const grades = [
      { studentId: 'a', subject: 'Mathématiques', value: 20, maxValue: 20 },
      { studentId: 'b', subject: 'EPS', value: 10, maxValue: 20 },
    ];
    expect(computeAverage(grades)).toBe(15);
  });
});
