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
    expect(errors[1].message).toContain('Matricule');
  });
});
