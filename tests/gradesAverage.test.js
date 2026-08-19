const {
  computeAverage,
  computeWeightedAverage,
  computeAnnuelleAverage,
  getCoefficient,
  computeSubjectRows,
  computeKindParts,
  normalizeGradeKind,
  gradeKindLabel,
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

describe('grade kind isolation and collège CI formula', () => {
  test('missing kind is DEVOIR; French labels', () => {
    expect(normalizeGradeKind(null)).toBe('DEVOIR');
    expect(normalizeGradeKind('')).toBe('DEVOIR');
    expect(normalizeGradeKind('interrogation')).toBe('INTERRO');
    expect(normalizeGradeKind('Composition')).toBe('COMPOSITION');
    expect(gradeKindLabel('INTERRO')).toBe('Interrogation');
    expect(gradeKindLabel('DEVOIR')).toBe('Devoir');
    expect(gradeKindLabel('COMPOSITION')).toBe('Composition');
  });

  test('legacy notes without kind stay a simple arithmetic moyenne matière', () => {
    const parts = computeKindParts([
      { value: 12, maxValue: 20 },
      { value: 16, maxValue: 20 },
    ]);
    expect(parts.devoir).toBe(14);
    expect(parts.interro).toBeNull();
    expect(parts.composition).toBeNull();
    expect(parts.average).toBe(14);
  });

  test('moyenne matière = (moy. interros + moy. devoirs + composition) / n of parts', () => {
    const grades = [
      { subject: 'Mathématiques', value: 10, maxValue: 20, kind: 'INTERRO' },
      { subject: 'Mathématiques', value: 20, maxValue: 20, kind: 'INTERRO' },
      { subject: 'Mathématiques', value: 14, maxValue: 20, kind: 'DEVOIR' },
      { subject: 'Mathématiques', value: 16, maxValue: 20, kind: 'COMPOSITION' },
    ];
    // moy. interro = 15; devoir = 14; compo = 16 → (15+14+16)/3 = 15
    const row = computeSubjectRows(grades).find((r) => r.subject === 'Mathématiques');
    expect(row.interro).toBe(15);
    expect(row.devoir).toBe(14);
    expect(row.composition).toBe(16);
    expect(row.average).toBe(15);
  });

  test('missing kind parts do not dilute the moyenne', () => {
    const grades = [
      { subject: 'Français', value: 12, maxValue: 20, kind: 'INTERRO' },
      { subject: 'Français', value: 16, maxValue: 20, kind: 'COMPOSITION' },
    ];
    // (12 + 16) / 2 = 14 — no empty devoir slot of 0
    const row = computeSubjectRows(grades)[0];
    expect(row.devoir).toBeNull();
    expect(row.average).toBe(14);
  });

  test('kinds are isolated: interros averaged first, not mixed with devoirs', () => {
    const grades = [
      { subject: 'Mathématiques', value: 10, maxValue: 20, kind: 'INTERRO' },
      { subject: 'Mathématiques', value: 20, maxValue: 20, kind: 'INTERRO' },
      { subject: 'Mathématiques', value: 8, maxValue: 20, kind: 'DEVOIR' },
    ];
    // grouped: (15 + 8) / 2 = 11.5 — not (10+20+8)/3 = 12.67
    expect(computeSubjectRows(grades)[0].average).toBe(11.5);
    expect(computeAverage(grades)).toBe(11.5);
  });

  test('Français kinds do not leak into Mathématiques', () => {
    const grades = [
      { subject: 'Mathématiques', value: 10, maxValue: 20, kind: 'COMPOSITION' },
      { subject: 'Français', value: 20, maxValue: 20, kind: 'COMPOSITION' },
    ];
    const rows = computeSubjectRows(grades);
    expect(rows.find((r) => r.subject === 'Mathématiques').average).toBe(10);
    expect(rows.find((r) => r.subject === 'Français').average).toBe(20);
  });

  test('T1 INTERRO is isolated from T2 COMPOSITION', () => {
    const grades = [
      { subject: 'Mathématiques', period: 'T1', value: 8, maxValue: 20, kind: 'INTERRO', studentId: 's1' },
      { subject: 'Mathématiques', period: 'T2', value: 20, maxValue: 20, kind: 'COMPOSITION', studentId: 's1' },
    ];
    expect(computeAverage(filterGradesForBulletin(grades, 'T1'))).toBe(8);
    expect(computeAverage(filterGradesForBulletin(grades, 'T2'))).toBe(20);
  });

  test('subject coefficients still apply after kind moyenne', () => {
    const grades = [
      { subject: 'Mathématiques', value: 15, maxValue: 20, kind: 'INTERRO' },
      { subject: 'Mathématiques', value: 15, maxValue: 20, kind: 'DEVOIR' },
      { subject: 'Mathématiques', value: 15, maxValue: 20, kind: 'COMPOSITION' },
      { subject: 'EPS', value: 10, maxValue: 20, kind: 'DEVOIR' },
    ];
    // Maths 15 × 4 + EPS 10 × 1 = 70 / 5 = 14
    expect(computeAverage(grades)).toBe(14);
  });
});
