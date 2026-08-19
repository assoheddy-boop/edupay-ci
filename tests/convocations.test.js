const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../src/config/database', () => ({
  class: { findFirst: jest.fn(), findMany: jest.fn() },
  student: { findMany: jest.fn(), findFirst: jest.fn() },
  subject: { findMany: jest.fn() },
  examSession: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  parentStudent: { findMany: jest.fn() },
}));

const prisma = require('../src/config/database');
const {
  parseExamType,
  examTypeLabel,
  parseTime,
  convocationTexts,
  createSession,
  getSession,
  getPrintBundle,
  getParentPrintBundle,
  generateConvocationPdf,
} = require('../src/services/convocationService');
const {
  convocationsPage,
  convocationPrint,
  convocationPdf,
} = require('../src/controllers/convocationController');

const SCHOOL = { id: 'school-1', name: 'IGEST', logoUrl: null, logoBase64: null, slug: 'igest' };
const OTHER_SCHOOL = { id: 'school-2', name: 'Autre' };
const KLASS = { id: 'class-1', name: '3e A', schoolId: 'school-1', schoolYear: '2025-2026' };
const SESSION = {
  id: 'sess-1',
  schoolId: 'school-1',
  classId: 'class-1',
  subject: 'Mathématiques',
  examType: 'BLANC',
  date: new Date('2026-05-12T12:00:00'),
  startTime: '08:00',
  room: '12',
  term: 'T2',
  createdAt: new Date('2026-08-19'),
  class: KLASS,
};
const STUDENTS = [
  {
    id: 'stu-1',
    firstName: 'Kofi',
    lastName: 'Yao',
    matricule: 'IG-DEMO-001',
    nationalMatricule: 'MEN-001',
    gender: 'M',
    series: null,
  },
];

function pdfPlainText(filepath) {
  const raw = fs.readFileSync(filepath).toString('latin1');
  return [...raw.matchAll(/<([0-9a-fA-F]+)>/g)]
    .map((m) => Buffer.from(m[1], 'hex').toString('latin1'))
    .join('');
}

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    render: jest.fn().mockReturnThis(),
    redirect: jest.fn(),
    download: jest.fn(),
  };
}

describe('exam type labels', () => {
  test('maps blanc vs national in French', () => {
    expect(parseExamType('blanc')).toBe('BLANC');
    expect(parseExamType('Examen national')).toBe('NATIONAL');
    expect(examTypeLabel('BLANC')).toBe('Examen blanc');
    expect(examTypeLabel('NATIONAL')).toBe('Examen national');
    expect(parseTime('8:05')).toEqual({ ok: true, value: '08:05' });
    expect(parseTime('25:00').ok).toBe(false);
  });

  test('convocation texts distinguish blanc and national and both matricules', () => {
    const blanc = convocationTexts({
      school: SCHOOL,
      session: { examType: 'BLANC', subject: 'Mathématiques', dateIso: '2026-05-12', startTime: '08:00', room: '12', term: 'T2' },
      student: STUDENTS[0],
      klass: KLASS,
    });
    expect(blanc.examTypeLabel).toBe('Examen blanc');
    expect(blanc.title).toContain('Examen blanc');
    expect(blanc.matriculeEcole).toBe('IG-DEMO-001');
    expect(blanc.matriculeNational).toBe('MEN-001');
    expect(blanc.brand).toBe('EduConnect');

    const national = convocationTexts({
      school: SCHOOL,
      session: { examType: 'NATIONAL', dateIso: '2026-06-01' },
      student: STUDENTS[0],
      klass: KLASS,
    });
    expect(national.examTypeLabel).toBe('Examen national');
    expect(national.title).toContain('Examen national');
    expect(national.intro).toContain('examen national');
  });
});

describe('convocation access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createSession refuses a class from another school', async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    const result = await createSession({
      schoolId: SCHOOL.id,
      classId: 'class-other',
      subject: 'Maths',
      examType: 'BLANC',
      date: '2026-05-12',
    });
    expect(result).toEqual({ ok: false, error: 'forbidden', status: 403 });
    expect(prisma.examSession.create).not.toHaveBeenCalled();
  });

  test('getSession returns 403 for another school', async () => {
    prisma.examSession.findFirst.mockResolvedValue(null);
    const result = await getSession({ schoolId: OTHER_SCHOOL.id, id: SESSION.id });
    expect(result.status).toBe(403);
    expect(prisma.examSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: SESSION.id, schoolId: OTHER_SCHOOL.id },
    }));
  });

  test('getPrintBundle builds rows with both matricules', async () => {
    prisma.examSession.findFirst.mockResolvedValue(SESSION);
    prisma.student.findMany.mockResolvedValue(STUDENTS);
    const bundle = await getPrintBundle({ schoolId: SCHOOL.id, id: SESSION.id });
    expect(bundle.ok).toBe(true);
    expect(bundle.session.examTypeLabel).toBe('Examen blanc');
    expect(bundle.rows[0].matricule).toBe('IG-DEMO-001');
    expect(bundle.rows[0].nationalMatricule).toBe('MEN-001');
  });

  test('parent cannot open another school session', async () => {
    prisma.parentStudent.findMany.mockResolvedValue([
      { student: { id: 'stu-1', classId: 'class-1', schoolId: SCHOOL.id, class: KLASS } },
    ]);
    prisma.examSession.findFirst.mockResolvedValue(null);
    const result = await getParentPrintBundle({ parentId: 'parent-1', id: 'sess-other' });
    expect(result.status).toBe(403);
  });
});

describe('convocation HTTP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.class.findMany.mockResolvedValue([KLASS]);
    prisma.subject.findMany.mockResolvedValue([{ id: 'sub-1', name: 'Mathématiques' }]);
    prisma.examSession.findMany.mockResolvedValue([]);
  });

  test('direction page returns 200', async () => {
    const res = mockRes();
    await convocationsPage({
      user: { role: 'SCHOOL_ADMIN', school: SCHOOL },
      query: {},
    }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.render).toHaveBeenCalledWith('school/convocations', expect.objectContaining({
      examTypes: expect.arrayContaining([
        expect.objectContaining({ value: 'BLANC', label: 'Examen blanc' }),
        expect.objectContaining({ value: 'NATIONAL', label: 'Examen national' }),
      ]),
    }));
  });

  test('print html includes blanc vs national', async () => {
    prisma.examSession.findFirst.mockResolvedValue(SESSION);
    prisma.student.findMany.mockResolvedValue(STUDENTS);
    const res = mockRes();
    await convocationPrint({
      user: { role: 'SCHOOL_ADMIN', school: SCHOOL },
      params: { id: SESSION.id },
      query: {},
    }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.render).toHaveBeenCalledWith('school/convocations-print', expect.objectContaining({
      session: expect.objectContaining({ examTypeLabel: 'Examen blanc' }),
      rows: expect.arrayContaining([
        expect.objectContaining({ matricule: 'IG-DEMO-001', nationalMatricule: 'MEN-001' }),
      ]),
    }));
  });

  test('print html includes examen national', async () => {
    prisma.examSession.findFirst.mockResolvedValue({ ...SESSION, examType: 'NATIONAL' });
    prisma.student.findMany.mockResolvedValue(STUDENTS);
    const res = mockRes();
    await convocationPrint({
      user: { role: 'SCHOOL_ADMIN', school: SCHOOL },
      params: { id: SESSION.id },
      query: {},
    }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.render).toHaveBeenCalledWith('school/convocations-print', expect.objectContaining({
      session: expect.objectContaining({ examTypeLabel: 'Examen national' }),
    }));
  });

  test('print returns 403 for another school', async () => {
    prisma.examSession.findFirst.mockResolvedValue(null);
    const res = mockRes();
    await convocationPrint({
      user: { role: 'SCHOOL_ADMIN', school: OTHER_SCHOOL },
      params: { id: SESSION.id },
      query: {},
    }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('convocation PDF', () => {
  test('PDF bytes contain exam type, both matricules and EduConnect', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'convoc-'));
    const session = {
      examType: 'NATIONAL',
      examTypeLabel: 'Examen national',
      dateIso: '2026-06-15',
      startTime: '09:30',
      room: 'A1',
      term: 'T3',
      subject: 'Français',
    };
    const rows = [{
      firstName: 'Awa',
      lastName: 'Koné',
      matricule: 'IG-DEMO-002',
      nationalMatricule: 'MEN-999',
    }];

    const { filepath } = await generateConvocationPdf({
      school: SCHOOL,
      session,
      klass: KLASS,
      rows,
      outputDir: tmp,
    });
    const text = pdfPlainText(filepath);
    expect(text).toContain('Examen national');
    expect(text).toContain('Matricule');
    expect(text).toContain('IG-DEMO-002');
    expect(text).toContain('national');
    expect(text).toContain('MEN-999');
    expect(text).toContain('EduConnect');
  });

  test('controller pdf returns 403 for another school', async () => {
    prisma.examSession.findFirst.mockResolvedValue(null);
    const res = mockRes();
    await convocationPdf({
      user: { role: 'SCHOOL_ADMIN', school: OTHER_SCHOOL },
      params: { id: SESSION.id },
      query: {},
    }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.download).not.toHaveBeenCalled();
  });
});
