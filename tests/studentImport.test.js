const ExcelJS = require('exceljs');

jest.mock('../src/config/database', () => ({
  class: { findMany: jest.fn() },
  student: { findMany: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
}));

jest.mock('../src/utils/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  auditMiddleware: () => (_req, _res, next) => next(),
}));

const prisma = require('../src/config/database');
const { logAudit } = require('../src/utils/audit');
const { parseXlsx, detectImportKind, buildExcelTemplate } = require('../src/utils/csvStudents');
const { importStudentsFromFile } = require('../src/services/studentImport');
const { importStudents } = require('../src/controllers/schoolController');

const SCHOOL = { id: 'school-1', name: 'IGEST' };
const OTHER_SCHOOL = { id: 'school-2', name: 'Autre collège' };
const KLASS = { id: 'class-1', name: 'CM2 A', schoolId: SCHOOL.id };
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function makeXlsx(rows, headers = [
  'prenom', 'nom', 'matricule', 'matricule_national', 'classe', 'date_naissance', 'genre',
]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Élèves');
  ws.addRow(headers);
  rows.forEach((row) => ws.addRow(row));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    render: jest.fn().mockReturnThis(),
    redirect: jest.fn(),
  };
}

function xlsxFile(buffer, name = 'eleves.xlsx') {
  return { originalname: name, mimetype: XLSX_MIME, buffer };
}

describe('xlsx parsing', () => {
  test('parseXlsx maps the same columns as CSV including both matricules', async () => {
    const buffer = await makeXlsx([
      ['Kofi', 'Koné', 'ETOILE-002', 'CI-MEN-002', 'CM2 A', '12/03/2015', 'M'],
    ]);
    const { rows } = await parseXlsx(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      firstName: 'Kofi',
      lastName: 'Koné',
      matricule: 'ETOILE-002',
      nationalMatricule: 'CI-MEN-002',
      className: 'CM2 A',
      birthDate: '12/03/2015',
      gender: 'M',
    });
  });

  test('detectImportKind accepts xlsx and csv, rejects xls', () => {
    expect(detectImportKind({ originalname: 'a.xlsx' })).toBe('xlsx');
    expect(detectImportKind({ originalname: 'a.csv' })).toBe('csv');
    expect(detectImportKind({ originalname: 'a.xls' })).toBeNull();
  });

  test('Excel modèle has the CSV columns', async () => {
    const wb = await buildExcelTemplate();
    const headers = wb.worksheets[0].getRow(1).values.filter(Boolean);
    expect(headers).toEqual([
      'prenom', 'nom', 'matricule', 'matricule_national', 'classe', 'date_naissance', 'genre',
    ]);
  });
});

describe('importStudentsFromFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.class.findMany.mockResolvedValue([KLASS]);
    prisma.student.findMany.mockResolvedValue([]);
    prisma.student.create.mockResolvedValue({ id: 'stu-1' });
    prisma.$transaction.mockImplementation(async (ops) => Promise.all(ops));
  });

  test('xlsx import creates students with school and national matricules', async () => {
    const buffer = await makeXlsx([
      ['Kofi', 'Koné', 'ETOILE-002', 'CI-MEN-002', 'CM2 A', '12/03/2015', 'M'],
      ['Awa', 'Traoré', '', '', 'CM2 A', '', 'F'],
    ]);

    const result = await importStudentsFromFile({
      schoolId: SCHOOL.id,
      file: xlsxFile(buffer),
      user: { school: SCHOOL },
    });

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.format).toBe('xlsx');
    expect(prisma.class.findMany).toHaveBeenCalledWith({ where: { schoolId: SCHOOL.id } });
    expect(prisma.student.create).toHaveBeenCalledTimes(2);
    expect(prisma.student.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        firstName: 'Kofi',
        lastName: 'Koné',
        matricule: 'ETOILE-002',
        nationalMatricule: 'CI-MEN-002',
        classId: KLASS.id,
        schoolId: SCHOOL.id,
        gender: 'M',
      }),
    }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'students_import',
      details: expect.objectContaining({ format: 'xlsx', count: 2 }),
    }));
  });

  test('bad file 400', async () => {
    const result = await importStudentsFromFile({
      schoolId: SCHOOL.id,
      file: xlsxFile(Buffer.from('ceci n’est pas un excel')),
    });
    expect(result).toMatchObject({ ok: false, error: 'file', status: 400 });
    expect(result.message).toMatch(/illisible|Excel/i);
    expect(prisma.student.create).not.toHaveBeenCalled();
  });

  test('other school 403', async () => {
    const result = await importStudentsFromFile({
      schoolId: null,
      file: xlsxFile(Buffer.from('PK')),
    });
    expect(result).toEqual({ ok: false, error: 'forbidden', status: 403 });
    expect(prisma.student.create).not.toHaveBeenCalled();
  });
});

describe('importStudents HTTP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.class.findMany.mockResolvedValue([KLASS]);
    prisma.student.findMany.mockResolvedValue([]);
    prisma.student.create.mockResolvedValue({ id: 'stu-1' });
    prisma.$transaction.mockImplementation(async (ops) => Promise.all(ops));
  });

  test('xlsx import creates students', async () => {
    const buffer = await makeXlsx([
      ['Kofi', 'Koné', 'ETOILE-002', 'CI-MEN-002', 'CM2 A', '12/03/2015', 'M'],
    ]);
    const res = mockRes();
    await importStudents({
      user: { role: 'SCHOOL_ADMIN', school: SCHOOL },
      file: xlsxFile(buffer),
      ip: '127.0.0.1',
      body: {},
      query: {},
    }, res);

    expect(prisma.student.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        firstName: 'Kofi',
        schoolId: SCHOOL.id,
        nationalMatricule: 'CI-MEN-002',
      }),
    }));
    expect(res.render).toHaveBeenCalledWith('school/students', expect.objectContaining({
      importResult: expect.objectContaining({ imported: 1, skipped: 0 }),
    }));
  });

  test('bad file 400', async () => {
    const res = mockRes();
    await importStudents({
      user: { role: 'SCHOOL_ADMIN', school: SCHOOL },
      file: xlsxFile(Buffer.from('not-xlsx')),
      body: {},
      query: {},
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.render).toHaveBeenCalledWith('school/students', expect.objectContaining({
      error: expect.stringMatching(/illisible|Excel/i),
    }));
    expect(prisma.student.create).not.toHaveBeenCalled();
  });

  test('other school 403', async () => {
    const buffer = await makeXlsx([['Kofi', 'Koné', 'X-1', 'MEN-1', 'CM2 A', '', 'M']]);
    const res = mockRes();
    await importStudents({
      user: { role: 'SCHOOL_ADMIN', school: OTHER_SCHOOL },
      body: { schoolId: SCHOOL.id },
      query: {},
      file: xlsxFile(buffer),
    }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.render).toHaveBeenCalledWith('error', expect.objectContaining({
      message: 'Accès refusé',
    }));
    expect(prisma.student.create).not.toHaveBeenCalled();
  });
});
