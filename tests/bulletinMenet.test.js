const {
  classifySubjectDomain,
  computeDomainBilans,
  publicTypeLabel,
  formatAbsenceSummary,
  buildMenetViewModel,
  buildBulletinHeaderModel,
  formatAgrementLine,
  formatContactRow,
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

  test('buildBulletinHeaderModel includes official IGES-style fields', () => {
    const school = {
      name: 'IGEST',
      officialName: 'COMPLEXE SCOLAIRE IGES',
      menetAgrement: '89 0459/MENSS/DESEC/SDE/CAB-1',
      nccNumber: '9329192D',
      postalAddress: '10 BP 776 Abj. 10',
      publicPhones: '23 535 036 / 07 577 620',
      educationLevels: 'Maternelle – Primaire – Secondaire Général',
      dren: 'DREN Abidjan 3',
    };
    const header = buildBulletinHeaderModel(school);
    expect(header.displayName).toBe('COMPLEXE SCOLAIRE IGES');
    expect(formatAgrementLine(school)).toContain('89 0459');
    expect(formatContactRow(school)).toContain('9329192D');
    expect(formatContactRow(school)).toContain('10 BP 776');
    expect(formatContactRow(school)).toContain('23 535 036');
    expect(header.dren).toBe('DREN Abidjan 3');
  });

  test('buildMenetViewModel header pulls from school record', () => {
    const vm = buildMenetViewModel({
      school: {
        name: 'IGEST',
        officialName: 'COMPLEXE SCOLAIRE IGES',
        menetAgrement: '89 0459/MENSS/DESEC/SDE/CAB-1',
        nccNumber: '9329192D',
        dren: 'DREN Abidjan 3',
        publicPhones: '23 535 036',
      },
      student: { class: { name: '6e 1' } },
      rows: [],
      average: 10,
      rank: 1,
      classSize: 30,
      term: 'T1',
      periodLabel: 'T1',
    });
    expect(vm.header.agrementLine).toContain('89 0459');
    expect(vm.header.contactRow).toContain('9329192D');
    expect(vm.header.dren).toBe('DREN Abidjan 3');
  });
});
