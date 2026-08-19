const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../src/config/database', () => ({
  class: { findFirst: jest.fn(), findMany: jest.fn() },
  student: { findMany: jest.fn() },
  deliberation: { findMany: jest.fn() },
  teacherClass: { findMany: jest.fn() },
  subject: { findMany: jest.fn() },
}));

const prisma = require('../src/config/database');
const {
  studentPeriodAverage,
  rankAndSlice,
  parseLimit,
  getPalmares,
  generatePalmaresPdf,
} = require('../src/services/palmaresService');
const { computeWeightedAverage, computeAnnuelleAverage } = require('../src/services/gradesAverage');
const {
  palmaresPrint,
  palmaresPdf,
  teacherPalmaresPage,
} = require('../src/controllers/palmaresController');

const SCHOOL = { id: 'school-1', name: 'IGEST', currentSchoolYear: '2025-2026' };
const KLASS = {
  id: 'class-1',
  name: '6e A',
  schoolId: 'school-1',
  schoolYear: '2025-2026',
  series: null,
  school: SCHOOL,
};

const KOFI = {
  id: 'stu-1',
  schoolId: 'school-1',
  classId: 'class-1',
  firstName: 'Kofi',
  lastName: 'Yao',
  matricule: 'IG-DEMO-001',
  gender: 'M',
  series: null,
  class: KLASS,
  grades: [
    { subject: 'Mathématiques', value: 16, maxValue: 20, period: 'T1', term: 'T1' },
    { subject: 'EPS', value: 10, maxValue: 20, period: 'T1', term: 'T1' },
  ],
};

const AWA = {
  id: 'stu-2',
  schoolId: 'school-1',
  classId: 'class-1',
  firstName: 'Awa',
  lastName: 'Kouassi',
  matricule: 'IG-DEMO-002',
  gender: 'F',
  series: null,
  class: KLASS,
  grades: [
    { subject: 'Mathématiques', value: 12, maxValue: 20, period: 'T1', term: 'T1' },
    { subject: 'EPS', value: 20, maxValue: 20, period: 'T1', term: 'T1' },
  ],
};

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    render: jest.fn().mockReturnThis(),
    redirect: jest.fn(),
    download: jest.fn(),
  };
}

function pdfPlainText(filepath) {
  const raw = fs.readFileSync(filepath).toString('latin1');
  return [...raw.matchAll(/<([0-9a-fA-F]+)>/g)]
    .map((m) => Buffer.from(m[1], 'hex').toString('latin1'))
    .join('');
}

function mockBoardQueries({ klass = KLASS, students = [KOFI, AWA] } = {}) {
  prisma.class.findFirst.mockResolvedValue(klass);
  prisma.class.findMany.mockResolvedValue([klass]);
  prisma.student.findMany.mockResolvedValue(students);
  prisma.deliberation.findMany.mockResolvedValue([]);
  prisma.subject.findMany.mockResolvedValue([]);
}

describe('palmarès ranking (weighted moyenne)', () => {
  test('parseLimit defaults to top 10', () => {
    expect(parseLimit(undefined)).toBe(10);
    expect(parseLimit('3')).toBe(3);
    expect(parseLimit('all')).toBe('all');
  });

  test('orders by Σ(note × coef) / Σ(coef), not arithmetic mean', () => {
    // Kofi arithmetic 13, weighted (16*4 + 10*1)/5 = 14.8
    // Awa arithmetic 16, weighted (12*4 + 20*1)/5 = 13.6
    expect(computeWeightedAverage(KOFI.grades)).toBe(14.8);
    expect(computeWeightedAverage(AWA.grades)).toBe(13.6);
    const kofi = studentPeriodAverage(KOFI.grades, 'T1', {});
    const awa = studentPeriodAverage(AWA.grades, 'T1', {});
    expect(kofi.average).toBe(14.8);
    expect(awa.average).toBe(13.6);

    const ranked = rankAndSlice([
      {
        studentId: AWA.id,
        lastName: AWA.lastName,
        average: awa.average,
        hasGrades: true,
        gender: AWA.gender,
      },
      {
        studentId: KOFI.id,
        lastName: KOFI.lastName,
        average: kofi.average,
        hasGrades: true,
        gender: KOFI.gender,
      },
    ], 'all');

    expect(ranked.map((r) => r.studentId)).toEqual([KOFI.id, AWA.id]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
  });

  test('INTERRO / DEVOIR / COMPOSITION uses the bulletin kind formula then coefficients', () => {
    const grades = [
      { subject: 'Mathématiques', value: 10, maxValue: 20, kind: 'INTERRO', period: 'T1' },
      { subject: 'Mathématiques', value: 20, maxValue: 20, kind: 'INTERRO', period: 'T1' },
      { subject: 'Mathématiques', value: 14, maxValue: 20, kind: 'DEVOIR', period: 'T1' },
      { subject: 'Mathématiques', value: 16, maxValue: 20, kind: 'COMPOSITION', period: 'T1' },
    ];
    // moy. interro 15, devoir 14, compo 16 → 15, then Maths coef 4
    expect(studentPeriodAverage(grades, 'T1', {}).average).toBe(15);
    expect(studentPeriodAverage(grades, 'T1', {}).average).toBe(computeWeightedAverage(grades));
  });

  test('annuelle reuses computeAnnuelleAverage', () => {
    const grades = [
      { subject: 'Mathématiques', period: 'T1', value: 10, maxValue: 20 },
      { subject: 'EPS', period: 'T1', value: 10, maxValue: 20 },
      { subject: 'Mathématiques', period: 'T2', value: 20, maxValue: 20 },
      { subject: 'EPS', period: 'T2', value: 20, maxValue: 20 },
    ];
    expect(computeAnnuelleAverage(grades)).toBe(15);
    expect(studentPeriodAverage(grades, 'ANNUELLE', {}).average).toBe(15);
  });

  test('top 3 slices after ranking', () => {
    const rows = [18, 16, 14, 12, 10].map((avg, i) => ({
      studentId: `s${i}`,
      lastName: `N${i}`,
      average: avg,
      hasGrades: true,
    }));
    const top = rankAndSlice(rows, 3);
    expect(top).toHaveLength(3);
    expect(top.map((r) => r.average)).toEqual([18, 16, 14]);
  });
});

describe('getPalmares', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBoardQueries();
  });

  test('ranks the class by weighted moyenne and uses saved mention when present', async () => {
    prisma.deliberation.findMany.mockResolvedValue([
      {
        studentId: KOFI.id,
        classId: KLASS.id,
        mention: 'Très bien',
        term: 'T1',
        schoolYear: '2025-2026',
      },
    ]);

    const board = await getPalmares({
      schoolId: SCHOOL.id,
      classId: KLASS.id,
      term: 'T1',
      schoolYear: '2025-2026',
      limit: 'all',
    });

    expect(board.ok).toBe(true);
    expect(board.groups).toHaveLength(1);
    const rows = board.groups[0].rows;
    expect(rows.map((r) => r.studentId)).toEqual([KOFI.id, AWA.id]);
    expect(rows[0].average).toBe(14.8);
    expect(rows[0].mention).toBe('Très bien');
    expect(rows[1].average).toBe(13.6);
    expect(rows[1].mention).toBe('Assez bien');
  });

  test('optional filles / garçons palmarès', async () => {
    const board = await getPalmares({
      schoolId: SCHOOL.id,
      classId: KLASS.id,
      term: 'T1',
      schoolYear: '2025-2026',
      limit: 10,
      byGender: '1',
    });
    expect(board.byGender).toBe(true);
    expect(board.groups[0].boys).toHaveLength(1);
    expect(board.groups[0].boys[0].studentId).toBe(KOFI.id);
    expect(board.groups[0].girls).toHaveLength(1);
    expect(board.groups[0].girls[0].studentId).toBe(AWA.id);
    expect(board.groups[0].boys[0].rank).toBe(1);
    expect(board.groups[0].girls[0].rank).toBe(1);
  });

  test('refuses a class from another school', async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    const board = await getPalmares({
      schoolId: SCHOOL.id,
      classId: 'class-other',
      term: 'T1',
    });
    expect(board).toEqual({ ok: false, error: 'forbidden', status: 403 });
  });
});

describe('palmarès HTTP isolation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('GET HTML print returns 200 for the school class', async () => {
    mockBoardQueries();
    const res = mockRes();
    await palmaresPrint({
      user: { school: SCHOOL },
      query: { classId: KLASS.id, term: 'T1' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.render).toHaveBeenCalledWith('school/palmares-print', expect.objectContaining({
      groups: expect.any(Array),
    }));
  });

  test('GET HTML print returns 403 for another school', async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    prisma.class.findMany.mockResolvedValue([KLASS]);
    const res = mockRes();
    await palmaresPrint({
      user: { school: SCHOOL },
      query: { classId: 'class-other', term: 'T1' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('GET PDF returns 200 for the school class', async () => {
    mockBoardQueries();
    const res = mockRes();
    await palmaresPdf({
      user: { school: SCHOOL },
      query: { classId: KLASS.id, term: 'T1' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.download).toHaveBeenCalled();
    const filepath = res.download.mock.calls[0][0];
    expect(fs.existsSync(filepath)).toBe(true);
  });

  test('GET PDF returns 403 for another school', async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    prisma.class.findMany.mockResolvedValue([KLASS]);
    const res = mockRes();
    await palmaresPdf({
      user: { school: SCHOOL },
      query: { classId: 'class-other', term: 'T1' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.download).not.toHaveBeenCalled();
  });

  test('teacher cannot open another class', async () => {
    prisma.teacherClass.findMany.mockResolvedValue([
      { class: { id: 'class-1', name: '6e A' } },
    ]);
    const res = mockRes();
    await teacherPalmaresPage({
      user: { teacher: { id: 't1', schoolId: SCHOOL.id, school: SCHOOL } },
      query: { classId: 'class-other', term: 'T1' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('palmarès PDF content', () => {
  test('PDF contains Tableau d’honneur, class, term and EduConnect', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'palmares-'));
    const board = {
      term: 'T1',
      schoolYear: '2025-2026',
      allClasses: false,
      byGender: false,
      groups: [{
        class: KLASS,
        rows: [{
          rank: 1,
          firstName: 'Kofi',
          lastName: 'Yao',
          className: '6e A',
          series: null,
          average: 14.8,
          mention: 'Bien',
        }],
        girls: [],
        boys: [],
      }],
    };
    const { filepath } = await generatePalmaresPdf({ school: SCHOOL, board, outputDir: tmp });
    const text = pdfPlainText(filepath);
    expect(text).toContain('Tableau');
    expect(text).toContain('honneur');
    expect(text).toContain('6e A');
    expect(text).toContain('Trimestre 1');
    expect(text).toContain('EduConnect');
    expect(text).toContain('Yao');
  });
});
