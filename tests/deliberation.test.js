jest.mock('../src/config/database', () => ({
  class: { findFirst: jest.fn(), findMany: jest.fn() },
  student: { findMany: jest.fn() },
  deliberation: { findMany: jest.fn(), upsert: jest.fn() },
  teacherClass: { findMany: jest.fn() },
  subject: { findMany: jest.fn() },
}));

jest.mock('../src/utils/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../src/config/database');
const {
  suggestFromAverage,
  getCouncilBoard,
  saveCouncil,
  councilRow,
} = require('../src/services/deliberationService');
const {
  saveDeliberations,
  deliberationsPv,
  teacherDeliberationsPage,
} = require('../src/controllers/deliberationController');

const SCHOOL = { id: 'school-1', name: 'IGEST', currentSchoolYear: '2025-2026' };
const KLASS = { id: 'class-1', name: '6e A', schoolId: 'school-1', schoolYear: '2025-2026', school: SCHOOL };
const STUDENT = {
  id: 'stu-1',
  schoolId: 'school-1',
  firstName: 'Kofi',
  lastName: 'Yao',
  matricule: 'IG-DEMO-001',
  gender: 'M',
  series: null,
  grades: [
    { subject: 'Mathématiques', value: 16, maxValue: 20, period: 'T1', term: 'T1' },
    { subject: 'EPS', value: 10, maxValue: 20, period: 'T1', term: 'T1' },
  ],
  absences: [
    { type: 'ABSENCE', date: new Date('2025-10-02') },
    { type: 'LATE', date: new Date('2025-10-03') },
  ],
};

const STUDENT_F = {
  id: 'stu-2',
  schoolId: 'school-1',
  firstName: 'Awa',
  lastName: 'Kouassi',
  matricule: 'IG-DEMO-002',
  gender: 'F',
  series: null,
  grades: [
    { subject: 'Mathématiques', value: 12, maxValue: 20, period: 'T1', term: 'T1' },
  ],
  absences: [],
};

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    render: jest.fn().mockReturnThis(),
    redirect: jest.fn(),
    download: jest.fn(),
  };
}

describe('deliberation thresholds', () => {
  test('suggests mention and decision from moyenne /20', () => {
    expect(suggestFromAverage(9.99)).toEqual({ mention: null, decision: 'Ajourné' });
    expect(suggestFromAverage(10)).toEqual({ mention: 'Passable', decision: 'Admis' });
    expect(suggestFromAverage(12)).toEqual({ mention: 'Assez bien', decision: 'Admis' });
    expect(suggestFromAverage(14)).toEqual({ mention: 'Bien', decision: 'Admis' });
    expect(suggestFromAverage(16)).toEqual({ mention: 'Très bien', decision: 'Admis' });
    expect(suggestFromAverage(18)).toEqual({ mention: 'Excellent', decision: 'Admis' });
    expect(suggestFromAverage(null, { hasGrades: false })).toEqual({
      mention: null,
      decision: 'À surveiller',
    });
  });
});

describe('weighted moyenne on the council table', () => {
  test('uses Σ(note × coef) / Σ(coef) (Maths 4, EPS 1 → 14.8)', () => {
    const row = councilRow({
      student: STUDENT,
      grades: STUDENT.grades,
      absences: STUDENT.absences,
      saved: null,
      coeffMap: {},
      term: 'T1',
      range: { start: new Date('2025-09-01'), end: new Date('2025-12-31T23:59:59.999Z') },
    });
    // arithmetic would be 13; weighted (16*4 + 10*1) / 5 = 14.8
    expect(row.average).toBe(14.8);
    expect(row.absences).toBe(1);
    expect(row.suggestedMention).toBe('Bien');
    expect(row.suggestedDecision).toBe('Admis');
  });

  test('getCouncilBoard attaches the weighted moyenne', async () => {
    prisma.class.findFirst.mockResolvedValue(KLASS);
    prisma.student.findMany.mockResolvedValue([STUDENT]);
    prisma.deliberation.findMany.mockResolvedValue([]);
    prisma.subject.findMany.mockResolvedValue([]);

    const board = await getCouncilBoard({
      schoolId: SCHOOL.id,
      classId: KLASS.id,
      term: 'T1',
      schoolYear: '2025-2026',
    });

    expect(board.ok).toBe(true);
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0].average).toBe(14.8);
  });

  test('attaches class rank and rank among boys / girls', async () => {
    prisma.class.findFirst.mockResolvedValue(KLASS);
    prisma.student.findMany.mockResolvedValue([STUDENT, STUDENT_F]);
    prisma.deliberation.findMany.mockResolvedValue([]);
    prisma.subject.findMany.mockResolvedValue([]);

    const board = await getCouncilBoard({
      schoolId: SCHOOL.id,
      classId: KLASS.id,
      term: 'T1',
      schoolYear: '2025-2026',
    });

    expect(board.ok).toBe(true);
    const boy = board.rows.find((r) => r.studentId === STUDENT.id);
    const girl = board.rows.find((r) => r.studentId === STUDENT_F.id);
    expect(boy.rank).toBe(1);
    expect(boy.classSize).toBe(2);
    expect(boy.genderRank).toBe(1);
    expect(boy.genderSize).toBe(1);
    expect(boy.genderGroup).toBe('garçons');
    expect(girl.rank).toBe(2);
    expect(girl.genderRank).toBe(1);
    expect(girl.genderGroup).toBe('filles');
  });

  test('filters the council table by lycée series', async () => {
    const lycée = { ...KLASS, name: '1ère C', series: 'C' };
    const studentC = { ...STUDENT, series: null };
    const studentA = { ...STUDENT_F, series: 'A' };
    prisma.class.findFirst.mockResolvedValue(lycée);
    prisma.student.findMany.mockResolvedValue([studentC, studentA]);
    prisma.deliberation.findMany.mockResolvedValue([]);
    prisma.subject.findMany.mockResolvedValue([]);

    const all = await getCouncilBoard({
      schoolId: SCHOOL.id,
      classId: lycée.id,
      term: 'T1',
      schoolYear: '2025-2026',
    });
    expect(all.rows).toHaveLength(2);
    expect(all.hasSeries).toBe(true);

    const onlyC = await getCouncilBoard({
      schoolId: SCHOOL.id,
      classId: lycée.id,
      term: 'T1',
      schoolYear: '2025-2026',
      series: 'C',
    });
    expect(onlyC.ok).toBe(true);
    expect(onlyC.rows).toHaveLength(1);
    expect(onlyC.rows[0].studentId).toBe(STUDENT.id);
    expect(onlyC.rows[0].series).toBe('C');
  });
});

describe('saveCouncil', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.class.findFirst.mockResolvedValue(KLASS);
    prisma.student.findMany.mockResolvedValue([STUDENT]);
    prisma.deliberation.findMany.mockResolvedValue([]);
    prisma.subject.findMany.mockResolvedValue([]);
    prisma.deliberation.upsert.mockResolvedValue({
      id: 'delib-1',
      studentId: STUDENT.id,
      mention: 'Bien',
      decision: 'Admis',
    });
  });

  test('upserts mention and decision for the class', async () => {
    const result = await saveCouncil({
      schoolId: SCHOOL.id,
      classId: KLASS.id,
      term: 'T1',
      schoolYear: '2025-2026',
      body: {
        rows: {
          [STUDENT.id]: { mention: 'Bien', decision: 'Admis', comment: 'Bon trimestre' },
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(prisma.deliberation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        schoolId: SCHOOL.id,
        classId: KLASS.id,
        studentId: STUDENT.id,
        term: 'T1',
        mention: 'Bien',
        decision: 'Admis',
        comment: 'Bon trimestre',
      }),
    }));
  });

  test('refuses a class from another school', async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    const result = await saveCouncil({
      schoolId: SCHOOL.id,
      classId: 'class-other',
      term: 'T1',
      body: { rows: { [STUDENT.id]: { decision: 'Admis' } } },
    });
    expect(result).toEqual({ ok: false, error: 'forbidden', status: 403 });
    expect(prisma.deliberation.upsert).not.toHaveBeenCalled();
  });
});

describe('deliberation HTTP isolation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('POST save returns 403 for another school', async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    const req = {
      user: { school: SCHOOL },
      body: { classId: 'class-other', term: 'T1', rows: {} },
      ip: '127.0.0.1',
    };
    const res = mockRes();
    await saveDeliberations(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('GET PV returns 200 for the school class', async () => {
    prisma.class.findFirst.mockResolvedValue(KLASS);
    prisma.student.findMany.mockResolvedValue([STUDENT]);
    prisma.deliberation.findMany.mockResolvedValue([]);
    prisma.subject.findMany.mockResolvedValue([]);
    const req = {
      user: { school: SCHOOL },
      query: { classId: KLASS.id, term: 'T1' },
    };
    const res = mockRes();
    await deliberationsPv(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.render).toHaveBeenCalledWith('school/deliberations-pv', expect.objectContaining({
      klass: KLASS,
      rows: expect.any(Array),
    }));
  });

  test('GET PV returns 403 for another school', async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    const req = {
      user: { school: SCHOOL },
      query: { classId: 'class-other', term: 'T1' },
    };
    const res = mockRes();
    await deliberationsPv(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('teacher cannot open another school class', async () => {
    prisma.teacherClass.findMany.mockResolvedValue([
      { class: { id: 'class-1', name: '6e A' } },
    ]);
    const req = {
      user: { teacher: { id: 't1', schoolId: SCHOOL.id, school: SCHOOL } },
      query: { classId: 'class-other', term: 'T1' },
    };
    const res = mockRes();
    await teacherDeliberationsPage(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
