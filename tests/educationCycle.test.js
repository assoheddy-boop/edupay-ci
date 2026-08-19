const {
  parseEducationCycle,
  cycleFlags,
  examTypesForCycle,
  allowsNationalExam,
  DEFAULT_CYCLE,
} = require('../src/utils/educationCycle');

describe('educationCycle', () => {
  test('defaults unknown values to COLLEGE so existing schools keep the full menu', () => {
    expect(parseEducationCycle(null)).toBe('COLLEGE');
    expect(parseEducationCycle('')).toBe('COLLEGE');
    expect(parseEducationCycle('inconnu')).toBe('COLLEGE');
    expect(DEFAULT_CYCLE).toBe('COLLEGE');
  });

  test('parses mixte before primaire prefixes', () => {
    expect(parseEducationCycle('primaire + collège')).toBe('MIXTE');
    expect(parseEducationCycle('PRIMAIRE')).toBe('PRIMAIRE');
    expect(parseEducationCycle('lycée')).toBe('LYCEE');
  });

  test('primaire hides national exam and lycée series', () => {
    const f = cycleFlags('PRIMAIRE');
    expect(f.hasNationalExam).toBe(false);
    expect(f.hasPalmares).toBe(false);
    expect(f.hasLyceeSeries).toBe(false);
    expect(f.hasNationalMatricule).toBe(false);
    expect(f.deliberationsLabel).toBe('Évaluations');
    expect(allowsNationalExam('PRIMAIRE')).toBe(false);
    expect(examTypesForCycle('PRIMAIRE').map((t) => t.value)).toEqual(['BLANC']);
  });

  test('college shows deliberations stack without lycée series', () => {
    const f = cycleFlags('COLLEGE');
    expect(f.hasNationalExam).toBe(true);
    expect(f.hasPalmares).toBe(true);
    expect(f.hasLyceeSeries).toBe(false);
    expect(f.hasNationalMatricule).toBe(true);
    expect(f.deliberationsLabel).toBe('Délibérations');
    expect(examTypesForCycle('COLLEGE').map((t) => t.value)).toEqual(['BLANC', 'NATIONAL']);
  });

  test('lycee adds series A/C/D', () => {
    const f = cycleFlags('LYCEE');
    expect(f.hasLyceeSeries).toBe(true);
    expect(f.hasNationalExam).toBe(true);
  });

  test('mixte exposes both primaire and secondaire flags', () => {
    const f = cycleFlags('MIXTE');
    expect(f.isMixte).toBe(true);
    expect(f.hasPrimaire).toBe(true);
    expect(f.hasSecondaire).toBe(true);
    expect(f.hasLyceeSeries).toBe(true);
    expect(f.hasNationalExam).toBe(true);
  });
});
