jest.mock('../src/config/database', () => ({
  class: { findFirst: jest.fn(), findMany: jest.fn() },
  student: { findMany: jest.fn() },
  subject: { findMany: jest.fn() },
}));

const prisma = require('../src/config/database');
const {
  parseKind,
  kindLabel,
  parseSheetDate,
  genderCell,
  genderCounts,
  buildRows,
  parseTerm,
  sheetTitle,
  sheetSubtitle,
  queryString,
  getSheet,
} = require('../src/services/emargementService');
const {
  emargementsPage,
  emargementsPrint,
} = require('../src/controllers/emargementController');

const SCHOOL = { id: 'school-1', name: 'IGEST', currentSchoolYear: '2025-2026' };
const KLASS = {
  id: 'class-1',
  name: '3e A',
  schoolId: 'school-1',
  schoolYear: '2025-2026',
  series: null,
};

const STUDENTS = [
  { id: 'stu-2', firstName: 'Awa', lastName: 'Koné', matricule: 'IG-002', gender: 'F', series: null },
  { id: 'stu-1', firstName: 'Kofi', lastName: 'Yao', matricule: 'IG-001', gender: 'M', series: null },
  { id: 'stu-3', firstName: 'Jean', lastName: 'Yao', matricule: 'IG-003', gender: null, series: 'C' },
];

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    render: jest.fn().mockReturnThis(),
    redirect: jest.fn(),
    download: jest.fn(),
  };
}

describe('emargement parsing', () => {
  test('parseKind maps composition aliases and defaults to composition', () => {
    expect(parseKind('COMPOSITION')).toBe('COMPOSITION');
    expect(parseKind('compo')).toBe('COMPOSITION');
    expect(parseKind('examen')).toBe('COMPOSITION');
    expect(parseKind('appel du jour')).toBe('APPEL');
    expect(parseKind('interro')).toBe('INTERRO');
    expect(parseKind('devoir')).toBe('DEVOIR');
    expect(parseKind('')).toBe('COMPOSITION');
    expect(parseKind('blanc')).toBe('EXAMEN_BLANC');
    expect(parseKind('examen blanc')).toBe('EXAMEN_BLANC');
    expect(parseKind('national')).toBe('EXAMEN_NATIONAL');
    expect(parseKind('examen national')).toBe('EXAMEN_NATIONAL');
    expect(kindLabel('APPEL')).toBe('Appel du jour');
    expect(kindLabel('EXAMEN_BLANC')).toBe('Examen blanc');
    expect(kindLabel('EXAMEN_NATIONAL')).toBe('Examen national');
  });

  test('parseSheetDate accepts ISO, French, and empty (Abidjan today)', () => {
    expect(parseSheetDate('2026-05-12')).toEqual({ ok: true, iso: '2026-05-12', label: '12/05/2026' });
    expect(parseSheetDate('12/05/2026')).toEqual({ ok: true, iso: '2026-05-12', label: '12/05/2026' });
    expect(parseSheetDate('not-a-date')).toEqual({ ok: false, error: 'date' });
    const empty = parseSheetDate('', new Date('2026-08-19T10:00:00Z'));
    expect(empty.ok).toBe(true);
    expect(empty.iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('gender cells and counts', () => {
    expect(genderCell('M')).toBe('G');
    expect(genderCell('F')).toBe('F');
    expect(genderCell(null)).toBe('—');
    expect(genderCounts(STUDENTS)).toEqual({ boys: 1, girls: 1, unknown: 1, total: 3 });
  });

  test('buildRows sorts by last name then first name (fr) and numbers', () => {
    const rows = buildRows(STUDENTS);
    expect(rows.map((r) => `${r.lastName} ${r.firstName}`)).toEqual(['Koné Awa', 'Yao Jean', 'Yao Kofi']);
    expect(rows[0].n).toBe(1);
    expect(rows[2].genderCell).toBe('G');
    expect(rows[0].matricule).toBe('IG-002');
    expect(rows[0].nationalMatricule).toBe('');
  });

  test('parseTerm ignored for appel, default T1 for composition', () => {
    expect(parseTerm('T2', 'APPEL')).toBe('');
    expect(parseTerm('', 'COMPOSITION')).toBe('T1');
    expect(parseTerm('Trimestre 3', 'COMPOSITION')).toBe('T3');
  });

  test('sheet title, subtitle and query string', () => {
    expect(sheetTitle('COMPOSITION')).toBe('Liste d’émargement — Composition');
    expect(sheetTitle('EXAMEN_BLANC')).toBe('Liste d’émargement — Examen blanc');
    expect(sheetTitle('EXAMEN_NATIONAL')).toBe('Liste d’émargement — Examen national');
    const sub = sheetSubtitle({
      klass: { name: '3e A', series: null },
      dateLabel: '12/05/2026',
      kind: 'COMPOSITION',
      subject: 'Mathématiques',
      term: 'T2',
      room: '12',
      schoolYear: '2025-2026',
    });
    expect(sub).toContain('3e A');
    expect(sub).toContain('Mathématiques');
    expect(sub).toContain('Trimestre 2');
    expect(sub).toContain('Salle 12');
    expect(queryString({ classId: 'c1', date: '2026-05-12', kind: 'COMPOSITION' })).toBe(
      'classId=c1&date=2026-05-12&kind=COMPOSITION',
    );
  });
});

describe('getSheet', () => {
  beforeEach(() => {
    prisma.class.findFirst.mockReset();
    prisma.student.findMany.mockReset();
  });

  test('rejects missing school or unknown class', async () => {
    expect(await getSheet({})).toEqual({ ok: false, error: 'forbidden', status: 403 });
    expect(await getSheet({ schoolId: SCHOOL.id })).toEqual({ ok: false, error: 'class' });
    prisma.class.findFirst.mockResolvedValue(null);
    const forbidden = await getSheet({ schoolId: SCHOOL.id, classId: 'other' });
    expect(forbidden).toEqual({ ok: false, error: 'forbidden', status: 403 });
  });

  test('builds numbered rows for the class, filtered by series', async () => {
    prisma.class.findFirst.mockResolvedValue({ ...KLASS, series: null });
    prisma.student.findMany.mockResolvedValue(STUDENTS);
    const sheet = await getSheet({
      schoolId: SCHOOL.id,
      classId: KLASS.id,
      date: '2026-05-12',
      kind: 'COMPOSITION',
      subject: 'Mathématiques',
      term: 'T2',
      series: 'C',
      room: '12',
    });
    expect(sheet.ok).toBe(true);
    expect(sheet.kind).toBe('COMPOSITION');
    expect(sheet.date.iso).toBe('2026-05-12');
    expect(sheet.term).toBe('T2');
    expect(sheet.subject).toBe('Mathématiques');
    expect(sheet.room).toBe('12');
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0].lastName).toBe('Yao');
    expect(sheet.rows[0].firstName).toBe('Jean');
    expect(sheet.counts.total).toBe(1);
    expect(sheet.title).toContain('Composition');
    expect(prisma.class.findFirst).toHaveBeenCalledWith({
      where: { id: KLASS.id, schoolId: SCHOOL.id },
    });
  });

  test('includes national matricule and examen blanc title', async () => {
    prisma.class.findFirst.mockResolvedValue(KLASS);
    prisma.student.findMany.mockResolvedValue([
      { id: 'stu-1', firstName: 'Kofi', lastName: 'Yao', matricule: 'IG-DEMO-001', nationalMatricule: 'MEN-001', gender: 'M', series: null },
    ]);
    const sheet = await getSheet({
      schoolId: SCHOOL.id,
      classId: KLASS.id,
      date: '2026-05-12',
      kind: 'EXAMEN_BLANC',
      subject: 'Mathématiques',
    });
    expect(sheet.ok).toBe(true);
    expect(sheet.kind).toBe('EXAMEN_BLANC');
    expect(sheet.title).toContain('Examen blanc');
    expect(sheet.rows[0].matricule).toBe('IG-DEMO-001');
    expect(sheet.rows[0].nationalMatricule).toBe('MEN-001');
  });
});

describe('emargement controller', () => {
  beforeEach(() => {
    prisma.class.findFirst.mockReset();
    prisma.class.findMany.mockReset();
    prisma.student.findMany.mockReset();
    prisma.subject.findMany.mockReset();
  });

  test('direction without school is refused', async () => {
    const res = mockRes();
    await emargementsPage({ user: { role: 'SCHOOL_ADMIN' }, query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.render).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Accès refusé' }));
  });

  test('assist/direction renders the sheet for a class', async () => {
    prisma.class.findMany.mockResolvedValue([KLASS]);
    prisma.class.findFirst.mockResolvedValue(KLASS);
    prisma.student.findMany.mockResolvedValue(STUDENTS);
    prisma.subject.findMany.mockResolvedValue([{ id: 'sub-1', name: 'Mathématiques' }]);
    const res = mockRes();
    await emargementsPage({
      user: { role: 'SCHOOL_ADMIN', school: SCHOOL, adminAssist: { type: 'school', schoolId: SCHOOL.id } },
      query: { classId: KLASS.id, date: '2026-05-12', kind: 'COMPOSITION', subject: 'Mathématiques' },
    }, res);
    expect(res.render).toHaveBeenCalledWith('school/emargements', expect.objectContaining({
      classId: KLASS.id,
      kind: 'COMPOSITION',
      rows: expect.arrayContaining([expect.objectContaining({ lastName: 'Koné' })]),
    }));
    const locals = res.render.mock.calls[0][1];
    expect(locals.rows).toHaveLength(3);
    expect(locals.qs).toContain('classId=class-1');
  });

  test('print view uses the dedicated template', async () => {
    prisma.class.findFirst.mockResolvedValue(KLASS);
    prisma.student.findMany.mockResolvedValue(STUDENTS);
    const res = mockRes();
    await emargementsPrint({
      user: { role: 'SCHOOL_ADMIN', school: SCHOOL },
      query: { classId: KLASS.id, date: '2026-05-12', kind: 'APPEL' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.render).toHaveBeenCalledWith('school/emargements-print', expect.objectContaining({
      titleSheet: 'Liste d’émargement — Appel du jour',
      rows: expect.any(Array),
    }));
  });
});
