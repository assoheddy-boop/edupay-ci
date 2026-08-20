const fs = require('fs');
const path = require('path');

jest.mock('../src/config/database', () => ({
  class: { findMany: jest.fn(), create: jest.fn() },
  student: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  agfneImportLog: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(),
}));

jest.mock('../src/utils/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  auditMiddleware: () => (_req, _res, next) => next(),
}));

const prisma = require('../src/config/database');
const { logAudit } = require('../src/utils/audit');
const { parseAgfneFile, detectAgfneFormat } = require('../src/services/agfneImport');
const {
  normalizeAgfneRow,
  mapAgfneRow,
  previewAgfneRows,
  applyAgfneImport,
} = require('../src/services/agfneMapper');

const FIXTURE = path.join(__dirname, 'fixtures', 'agfne-sample.csv');
const SCHOOL_ID = 'school-agfne';
const SCHOOL_YEAR = '2025-2026';

describe('detectAgfneFormat', () => {
  test('accepts csv, xlsx, xml', () => {
    expect(detectAgfneFormat({ originalname: 'eleves.csv' })).toBe('csv');
    expect(detectAgfneFormat({ originalname: 'eleves.xlsx' })).toBe('xlsx');
    expect(detectAgfneFormat({ originalname: 'sigfne.xml', mimetype: 'application/xml' })).toBe('xml');
  });
});

describe('parseAgfneFile CSV fixture', () => {
  test('parses French MEN headers from sample CSV', async () => {
    const buffer = fs.readFileSync(FIXTURE);
    const result = await parseAgfneFile({ originalname: 'agfne-sample.csv', buffer });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('csv');
    expect(result.rows.length).toBe(3);
    expect(result.rows[0]).toMatchObject({
      firstName: 'Kofi',
      lastName: 'Koné',
      nationalMatricule: 'CI-MEN-001234567',
      className: '6ème A',
      gender: 'M',
      nationality: 'Ivoirienne',
    });
  });

  test('parses SIGFNE XML eleve nodes', async () => {
    const xml = `<?xml version="1.0"?>
<eleves>
  <eleve>
    <matricule_national>CI-MEN-XML-001</matricule_national>
    <nom>Coulibaly</nom>
    <prenoms>Fatou</prenoms>
    <classe>4ème A</classe>
    <sexe>F</sexe>
    <nationalite>Ivoirienne</nationalite>
  </eleve>
</eleves>`;
    const result = await parseAgfneFile({ originalname: 'sigfne.xml', mimetype: 'application/xml', buffer: Buffer.from(xml) });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('xml');
    expect(result.rows[0]).toMatchObject({
      nationalMatricule: 'CI-MEN-XML-001',
      lastName: 'Coulibaly',
      firstName: 'Fatou',
      className: '4ème A',
      gender: 'F',
    });
  });
});

describe('normalizeAgfneRow', () => {
  test('maps SIGFNE column names', () => {
    const row = normalizeAgfneRow({
      'Matricule national': 'MEN-99',
      Nom: 'Yao',
      Prénoms: 'Jean',
      'Date naissance': '01/01/2010',
      Sexe: 'M',
      Nationalité: 'Ivoirienne',
      Classe: '3ème C',
    }, 2);
    expect(row).toMatchObject({
      lineNumber: 2,
      nationalMatricule: 'MEN-99',
      lastName: 'Yao',
      firstName: 'Jean',
      className: '3ème C',
    });
  });
});

describe('mapAgfneRow', () => {
  test('validates required fields', () => {
    const ok = mapAgfneRow({
      lineNumber: 1,
      firstName: 'Awa',
      lastName: 'Koné',
      className: 'CM2',
      gender: 'F',
    });
    expect(ok.valid).toBe(true);

    const bad = mapAgfneRow({ lineNumber: 2, firstName: '', lastName: 'X', className: '' });
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });
});

describe('previewAgfneRows', () => {
  const classes = [{ id: 'c1', name: '6ème A', schoolId: SCHOOL_ID }];
  const existing = [{ id: 's1', matricule: null, nationalMatricule: 'CI-MEN-001234567' }];

  test('marks existing national matricule as update', () => {
    const rows = [{ lineNumber: 2, firstName: 'Kofi', lastName: 'Koné', className: '6ème A', nationalMatricule: 'CI-MEN-001234567', gender: 'M' }];
    const preview = previewAgfneRows(rows, classes, existing);
    expect(preview[0].action).toBe('update');
    expect(preview[0].existingId).toBe('s1');
  });

  test('marks new student as create', () => {
    const rows = [{ lineNumber: 3, firstName: 'Awa', lastName: 'Traoré', className: '6ème A', nationalMatricule: 'CI-MEN-NEW', gender: 'F' }];
    const preview = previewAgfneRows(rows, classes, existing);
    expect(preview[0].action).toBe('create');
  });
});

describe('applyAgfneImport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.class.findMany.mockResolvedValue([{ id: 'c1', name: '6ème A', schoolId: SCHOOL_ID }]);
    prisma.student.findMany.mockResolvedValue([
      { id: 's1', matricule: null, nationalMatricule: 'CI-MEN-001234567' },
    ]);
    prisma.student.update.mockResolvedValue({ id: 's1' });
    prisma.student.create.mockResolvedValue({ id: 's2', matricule: null, nationalMatricule: 'CI-MEN-001234568' });
    prisma.class.create.mockResolvedValue({ id: 'c2', name: '5ème B' });
    prisma.$transaction.mockImplementation(async (fn) => fn({
      class: { create: prisma.class.create },
      student: { create: prisma.student.create, update: prisma.student.update },
    }));
  });

  test('updates existing and creates new students', async () => {
    const rows = [
      { lineNumber: 2, valid: true, firstName: 'Kofi', lastName: 'Koné', className: '6ème A', nationalMatricule: 'CI-MEN-001234567', gender: 'M', nationality: 'Ivoirienne', birthDate: null, matricule: null },
      { lineNumber: 3, valid: true, firstName: 'Awa', lastName: 'Traoré', className: '6ème A', nationalMatricule: 'CI-MEN-001234568', gender: 'F', nationality: 'Ivoirienne', birthDate: null, matricule: null },
      { lineNumber: 4, valid: true, firstName: 'Moussa', lastName: 'Diabaté', className: '5ème B', nationalMatricule: null, gender: 'M', nationality: 'Ivoirienne', birthDate: null, matricule: null },
    ];

    const result = await applyAgfneImport({
      schoolId: SCHOOL_ID,
      schoolYear: SCHOOL_YEAR,
      rows,
      user: { id: 'u1' },
      filename: 'agfne-sample.csv',
    });

    expect(result.ok).toBe(true);
    expect(result.updated).toBe(1);
    expect(result.created).toBe(2);
    expect(prisma.student.update).toHaveBeenCalledTimes(1);
    expect(prisma.student.create).toHaveBeenCalledTimes(2);
    expect(prisma.class.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: '5ème B', schoolId: SCHOOL_ID }),
    }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'agfne_import',
      details: expect.objectContaining({ created: 2, updated: 1 }),
    }));
  });
});
