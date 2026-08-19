const { parseCsv, prepareStudentRows } = require('../src/utils/csvStudents');

describe('csvStudents', () => {
  test('parse CSV with semicolon delimiter', () => {
    const csv = 'prenom;nom;matricule;classe;date_naissance\nKofi;Koné;ABC-1;CM2 A;12/03/2015';
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].firstName).toBe('Kofi');
    expect(rows[0].lastName).toBe('Koné');
    expect(rows[0].className).toBe('CM2 A');
  });

  test('prepareStudentRows validates class and matricule', () => {
    const classes = [{ id: 'cls1', name: 'CM2 A' }];
    const { valid, errors } = prepareStudentRows(
      [
        { lineNumber: 2, firstName: 'Kofi', lastName: 'Koné', className: 'CM2 A', matricule: 'X-1', birthDate: '12/03/2015' },
        { lineNumber: 3, firstName: 'Awa', lastName: 'Traoré', className: 'CM2 B', matricule: '', birthDate: '' },
        { lineNumber: 4, firstName: 'Kofi', lastName: 'Koné', className: 'CM2 A', matricule: 'X-1', birthDate: '' },
      ],
      classes,
      new Set(),
    );
    expect(valid).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('introuvable');
    expect(errors[1].message).toContain('Matricule école');
  });

  test('accepts matricule_national / matricule national and isolates duplicates per import', () => {
    const csv = 'prenom;nom;matricule;matricule national;classe\nKofi;Koné;E-1;MEN-1;CM2 A\nAwa;Yao;E-2;MEN-1;CM2 A';
    const { rows } = parseCsv(csv);
    expect(rows[0].nationalMatricule).toBe('MEN-1');
    const classes = [{ id: 'cls1', name: 'CM2 A' }];
    const { valid, errors } = prepareStudentRows(rows, classes, new Set(), new Set());
    expect(valid).toHaveLength(1);
    expect(valid[0].nationalMatricule).toBe('MEN-1');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Matricule national');
  });

  test('rejects invalid dates and gender with French messages', () => {
    const classes = [{ id: 'cls1', name: 'CM2 A' }];
    const { valid, errors } = prepareStudentRows(
      [
        { lineNumber: 2, firstName: 'Kofi', lastName: 'Koné', className: 'CM2 A', birthDate: '32/13/2015', gender: 'M' },
        { lineNumber: 3, firstName: 'Awa', lastName: 'Yao', className: 'CM2 A', birthDate: '12/03/2015', gender: 'X' },
        { lineNumber: 4, firstName: 'Yao', lastName: 'Bamba', className: 'CM2 A', birthDate: '', gender: 'Fille' },
      ],
      classes,
    );
    expect(valid).toHaveLength(1);
    expect(valid[0].gender).toBe('F');
    expect(errors.map((e) => e.message).join(' ')).toMatch(/Date invalide/);
    expect(errors.map((e) => e.message).join(' ')).toMatch(/Genre invalide/);
  });
});
