const {
  classifySubjectDomain,
  computeDomainBilans,
  publicTypeLabel,
  formatAbsenceSummary,
  buildMenetViewModel,
} = require('../src/utils/bulletinMenet');

describe('bulletinMenet helpers', () => {
  test('classifySubjectDomain groups CI subjects', () => {
    expect(classifySubjectDomain('Français')).toBe('LETTRES');
    expect(classifySubjectDomain('Mathématiques')).toBe('SCIENCES');
    expect(classifySubjectDomain('EPS')).toBe('AUTRES');
    expect(classifySubjectDomain('Conduite')).toBe('AUTRES');
  });

  test('computeDomainBilans weighted averages', () => {
    const rows = [
      { subject: 'Français', coefficient: 3, average: 12 },
      { subject: 'Anglais', coefficient: 2, average: 14 },
      { subject: 'Mathématiques', coefficient: 4, average: 10 },
      { subject: 'EPS', coefficient: 1, average: 16 },
    ];
    const bilans = computeDomainBilans(rows);
    expect(bilans.LETTRES).toBe(12.8);
    expect(bilans.SCIENCES).toBe(10);
    expect(bilans.AUTRES).toBe(16);
  });

  test('publicTypeLabel french labels', () => {
    expect(publicTypeLabel('PRIVE')).toBe('Privé');
    expect(publicTypeLabel('PUBLIC')).toBe('Public');
  });

  test('formatAbsenceSummary counts days and lates', () => {
    expect(formatAbsenceSummary([])).toBe('0');
    expect(formatAbsenceSummary([{ type: 'ABSENCE' }, { type: 'LATE' }])).toBe('1 jour(s), 1 retard(s)');
  });

  test('buildMenetViewModel exposes bulletin fields', () => {
    const vm = buildMenetViewModel({
      school: { name: 'IGEST', publicType: 'PRIVE', currentSchoolYear: '2025-2026' },
      student: { firstName: 'Awa', lastName: 'K', class: { name: '6e 1', schoolYear: '2025-2026' } },
      rows: [],
      average: 12.5,
      rank: 2,
      classSize: 40,
      classStats: { classAverage: 11, highest: 16, lowest: 8 },
      domainBilans: { LETTRES: 13, SCIENCES: 11, AUTRES: 15 },
      absences: [{ type: 'ABSENCE' }],
      mention: 'Bien',
      decision: 'Admis',
      term: 'T1',
      periodLabel: 'Trimestre 1',
      repeatYear: false,
    });
    expect(vm.statut).toBe('Privé');
    expect(vm.distinction).toBe('Bien — Admis');
    expect(vm.absencesSummary).toBe('1 jour(s)');
    expect(vm.termAverageLabel).toBe('Moyenne du 1er trimestre');
  });
});
