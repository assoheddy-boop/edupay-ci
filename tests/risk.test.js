jest.mock('../src/config/database', () => ({
  class: { findFirst: jest.fn(), findMany: jest.fn() },
  student: { findMany: jest.fn() },
  teacherClass: { findMany: jest.fn() },
  subject: { findMany: jest.fn() },
}));

const prisma = require('../src/config/database');
const {
  RISK_THRESHOLDS,
  scoreStudentRisk,
  riskRow,
  compareRiskRows,
  getRiskBoard,
} = require('../src/services/riskService');
const { risquesPage, teacherRisquesPage } = require('../src/controllers/riskController');

const SCHOOL = { id: 'school-1', name: 'IGEST', currentSchoolYear: '2025-2026' };
const KLASS = { id: 'class-1', name: '6e A', schoolId: 'school-1', schoolYear: '2025-2026', school: SCHOOL };

function studentLowAverage() {
  return {
    id: 'stu-low',
    schoolId: SCHOOL.id,
    classId: KLASS.id,
    firstName: 'Awa',
    lastName: 'Koné',
    matricule: 'IG-DEMO-010',
    class: { id: KLASS.id, name: KLASS.name },
    grades: [
      { subject: 'Mathématiques', value: 8.4, maxValue: 20, period: 'T1', term: 'T1', kind: 'DEVOIR' },
    ],
    absences: [
      { type: 'ABSENCE', date: new Date('2025-10-02') },
      { type: 'ABSENCE', date: new Date('2025-10-08') },
      { type: 'ABSENCE', date: new Date('2025-10-15') },
      { type: 'ABSENCE', date: new Date('2025-11-03') },
      { type: 'ABSENCE', date: new Date('2025-11-12') },
      { type: 'ABSENCE', date: new Date('2025-11-20') },
      { type: 'LATE', date: new Date('2025-10-03') },
    ],
  };
}

function studentOk() {
  return {
    id: 'stu-ok',
    schoolId: SCHOOL.id,
    classId: KLASS.id,
    firstName: 'Kofi',
    lastName: 'Yao',
    matricule: 'IG-DEMO-001',
    class: { id: KLASS.id, name: KLASS.name },
    grades: [
      { subject: 'Mathématiques', value: 16, maxValue: 20, period: 'T1', term: 'T1', kind: 'DEVOIR' },
      { subject: 'EPS', value: 14, maxValue: 20, period: 'T1', term: 'T1', kind: 'COMPOSITION' },
    ],
    absences: [],
  };
}

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    render: jest.fn().mockReturnThis(),
    redirect: jest.fn(),
  };
}

describe('score pédagogique (règles, pas d’IA)', () => {
  test('moyenne < 10 → Élevé', () => {
    const scored = scoreStudentRisk({ average: 8.4, absences: 0, lates: 0, hasGrades: true });
    expect(scored.level).toBe('ELEVE');
    expect(scored.label).toBe('Élevé');
    expect(scored.motif).toBe('moyenne 8,4');
    expect(scored.score).toBeGreaterThanOrEqual(50);
  });

  test('absences >= 6 → Élevé even with a passing moyenne', () => {
    const scored = scoreStudentRisk({ average: 12, absences: 6, lates: 0, hasGrades: true });
    expect(scored.level).toBe('ELEVE');
    expect(scored.motif).toContain('6 absences');
  });

  test('thresholds match the documented UI values', () => {
    expect(RISK_THRESHOLDS.averageHigh).toBe(10);
    expect(RISK_THRESHOLDS.absencesHigh).toBe(6);
    expect(RISK_THRESHOLDS.latesHigh).toBe(8);
    expect(RISK_THRESHOLDS.averageMedium).toBe(12);
    expect(RISK_THRESHOLDS.absencesMedium).toBe(3);
    expect(RISK_THRESHOLDS.latesMedium).toBe(4);
  });

  test('passing moyenne and few absences → Faible', () => {
    const scored = scoreStudentRisk({ average: 14.8, absences: 1, lates: 0, hasGrades: true });
    expect(scored.level).toBe('FAIBLE');
    expect(scored.label).toBe('Faible');
  });

  test('no grades → Moyen', () => {
    const scored = scoreStudentRisk({ average: null, absences: 0, lates: 0, hasGrades: false });
    expect(scored.level).toBe('MOYEN');
    expect(scored.motif).toBe('pas de notes');
  });
});

describe('riskRow uses weighted moyenne (sprints 1+5)', () => {
  test('flags a student with low moyenne as Élevé and builds the short motif', () => {
    const row = riskRow({
      student: studentLowAverage(),
      coeffMap: {},
      term: 'T1',
      range: { start: new Date('2025-09-01'), end: new Date('2025-12-31T23:59:59.999Z') },
    });
    expect(row.average).toBe(8.4);
    expect(row.absences).toBe(6);
    expect(row.lates).toBe(1);
    expect(row.level).toBe('ELEVE');
    expect(row.motif).toBe('moyenne 8,4 · 6 absences · 1 retard');
  });

  test('INTERRO / DEVOIR / COMPOSITION moyenne matière then coefficients', () => {
    const student = {
      id: 'stu-kinds',
      firstName: 'Bintou',
      lastName: 'Traoré',
      classId: KLASS.id,
      class: { id: KLASS.id, name: '6e A' },
      grades: [
        { subject: 'Mathématiques', value: 4, maxValue: 20, period: 'T1', term: 'T1', kind: 'INTERRO' },
        { subject: 'Mathématiques', value: 8, maxValue: 20, period: 'T1', term: 'T1', kind: 'DEVOIR' },
        { subject: 'Mathématiques', value: 8, maxValue: 20, period: 'T1', term: 'T1', kind: 'COMPOSITION' },
      ],
      absences: [],
    };
    const row = riskRow({
      student,
      coeffMap: {},
      term: 'T1',
      range: { start: new Date('2025-09-01'), end: new Date('2025-12-31T23:59:59.999Z') },
    });
    // (4 + 8 + 8) / 3 = 6.67 → Élevé
    expect(row.average).toBe(6.67);
    expect(row.level).toBe('ELEVE');
  });

  test('sorts Élevé before Faible', () => {
    const high = { level: 'ELEVE', score: 50, lastName: 'Zongo', firstName: 'A' };
    const low = { level: 'FAIBLE', score: 0, lastName: 'Aaa', firstName: 'A' };
    expect(compareRiskRows(high, low)).toBeLessThan(0);
    expect([high, low].sort(compareRiskRows)[0].level).toBe('ELEVE');
  });
});

describe('getRiskBoard isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.subject.findMany.mockResolvedValue([]);
    prisma.class.findFirst.mockResolvedValue(KLASS);
    prisma.student.findMany.mockResolvedValue([studentLowAverage(), studentOk()]);
  });

  test('low moyenne is flagged Élevé and listed first', async () => {
    const board = await getRiskBoard({
      schoolId: SCHOOL.id,
      classId: KLASS.id,
      term: 'T1',
      schoolYear: '2025-2026',
    });
    expect(board.ok).toBe(true);
    expect(board.rows[0].studentId).toBe('stu-low');
    expect(board.rows[0].level).toBe('ELEVE');
    expect(board.rows[1].level).toBe('FAIBLE');
    expect(board.counts.ELEVE).toBe(1);
  });

  test('refuses a class from another school', async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    const board = await getRiskBoard({
      schoolId: SCHOOL.id,
      classId: 'class-other',
      term: 'T1',
      schoolYear: '2025-2026',
    });
    expect(board).toEqual({ ok: false, error: 'forbidden', status: 403 });
  });
});

describe('risques HTTP isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.class.findMany.mockResolvedValue([KLASS]);
    prisma.class.findFirst.mockResolvedValue(KLASS);
    prisma.student.findMany.mockResolvedValue([studentLowAverage()]);
    prisma.subject.findMany.mockResolvedValue([]);
    prisma.teacherClass.findMany.mockResolvedValue([{ class: KLASS }]);
  });

  test('GET /school/risques returns 403 for another school class', async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    const req = {
      user: { school: SCHOOL },
      query: { classId: 'class-other', term: 'T1' },
    };
    const res = mockRes();
    await risquesPage(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('GET /school/risques renders Élevé for a low moyenne', async () => {
    const req = {
      user: { school: SCHOOL },
      query: { classId: KLASS.id, term: 'T1' },
    };
    const res = mockRes();
    await risquesPage(req, res);
    expect(res.render).toHaveBeenCalledWith('school/risques', expect.objectContaining({
      rows: expect.arrayContaining([
        expect.objectContaining({ studentId: 'stu-low', level: 'ELEVE' }),
      ]),
    }));
  });

  test('teacher cannot open another school class', async () => {
    const req = {
      user: { teacher: { id: 't1', schoolId: SCHOOL.id, school: SCHOOL } },
      query: { classId: 'class-other', term: 'T1' },
    };
    const res = mockRes();
    await teacherRisquesPage(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
