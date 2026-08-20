jest.mock('../src/config/database', () => ({
  class: { count: jest.fn() },
  student: { count: jest.fn(), findMany: jest.fn() },
  teacher: { count: jest.fn() },
  payment: { findMany: jest.fn(), aggregate: jest.fn() },
  examSession: { count: jest.fn() },
  absenceJustification: { count: jest.fn() },
  absence: { count: jest.fn() },
  socialCase: { count: jest.fn() },
  behaviorNote: { count: jest.fn() },
  canteenMenu: { findFirst: jest.fn() },
  extracurricular: { count: jest.fn() },
  lostItem: { count: jest.fn() },
  financeTransaction: { count: jest.fn() },
  payrollRun: { findFirst: jest.fn() },
  deliberation: { count: jest.fn() },
}));

jest.mock('../services/PaymentService', () => ({
  getPendingPayments: jest.fn(),
}));

jest.mock('../services/ReinscriptionService', () => ({
  listReinscriptionRows: jest.fn(),
  getReinscriptionStats: jest.fn(),
}));

jest.mock('../src/services/caisseService', () => ({
  listTodayTill: jest.fn(),
  todayRange: jest.fn(() => ({
    start: new Date('2026-08-20T00:00:00.000Z'),
    end: new Date('2026-08-20T23:59:59.999Z'),
  })),
}));

jest.mock('../src/services/riskService', () => ({
  resolveRiskTerm: jest.fn(() => 'T1'),
  getRiskSummary: jest.fn(),
}));

jest.mock('../services/StatsService', () => ({
  getSchoolGenderStats: jest.fn(),
  getAbsenceStatsByGender: jest.fn(),
  getSuccessRateByGender: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const prisma = require('../src/config/database');
const { getPendingPayments } = require('../services/PaymentService');
const { listReinscriptionRows, getReinscriptionStats } = require('../services/ReinscriptionService');
const { listTodayTill } = require('../src/services/caisseService');
const { getRiskSummary } = require('../src/services/riskService');
const {
  getSchoolGenderStats,
  getAbsenceStatsByGender,
  getSuccessRateByGender,
} = require('../services/StatsService');
const {
  loadRoleDashboard,
  countBulletinsToGenerate,
} = require('../src/services/dashboardService');
const { requirePermission } = require('../src/middleware/requirePermission');
const { PERMISSIONS, attachStaffContext } = require('../src/utils/staffPermissions');

jest.mock('../src/middleware/modules', () => ({
  resolveSchoolId: jest.fn(async (user) => user?.school?.id || user?.staffAssignments?.[0]?.schoolId || null),
}));

const { resolveSchoolId } = require('../src/middleware/modules');

const SCHOOL_ID = 'sch-dash';
const SCHOOL = { id: SCHOOL_ID, name: 'Lycée Test', currentSchoolYear: '2025-2026' };

function staffUser(staffRole) {
  return {
    id: 'u-staff',
    role: 'SCHOOL_ADMIN',
    school: null,
    staffAssignments: [{ schoolId: SCHOOL_ID, staffRole, school: SCHOOL }],
  };
}

describe('dashboardService.loadRoleDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getPendingPayments.mockResolvedValue([{ amount: 5000 }, { amount: 3000 }]);
    getReinscriptionStats.mockResolvedValue({ promoted: 10, repeated: 2 });
    getSchoolGenderStats.mockResolvedValue({ boys: 40, girls: 35 });
    getAbsenceStatsByGender.mockResolvedValue({ boys: 5, girls: 4 });
    getSuccessRateByGender.mockResolvedValue({
      boys: { averageOn20: 11 },
      girls: { averageOn20: 12 },
    });
    getRiskSummary.mockResolvedValue({
      ok: true,
      rows: [],
      counts: { ELEVE: 1, MOYEN: 2, FAIBLE: 3 },
      term: 'T1',
    });
    listReinscriptionRows.mockResolvedValue({
      rows: [{ enrolled: false }, { enrolled: true }],
    });
    listTodayTill.mockResolvedValue({
      payments: [{ student: { firstName: 'A', lastName: 'B' }, amount: 10000, feeType: { name: 'Scolarité' } }],
      totals: { total: 10000, count: 1, byMethod: {} },
    });
    prisma.student.findMany.mockResolvedValue([
      { id: 's1', bulletins: [] },
      { id: 's2', bulletins: [{ id: 'b1' }] },
    ]);
    prisma.examSession.count.mockResolvedValue(3);
    prisma.absenceJustification.count.mockResolvedValue(4);
    prisma.student.count.mockResolvedValueOnce(10).mockResolvedValueOnce(6);
    prisma.deliberation.count.mockResolvedValue(4);
    prisma.payment.aggregate.mockResolvedValue({ _count: 2, _sum: { amount: 25000 } });
    prisma.financeTransaction.count.mockResolvedValue(12);
    prisma.payrollRun.findFirst.mockResolvedValue({ month: 8, year: 2026, status: 'DRAFT', totalNet: 900000 });
    prisma.absence.count.mockResolvedValue(2);
    prisma.socialCase.count.mockResolvedValue(5);
    prisma.behaviorNote.count.mockResolvedValue(1);
    prisma.canteenMenu.findFirst.mockResolvedValue({ menu: 'Riz sauce arachide' });
    prisma.extracurricular.count.mockResolvedValue(6);
    prisma.lostItem.count.mockResolvedValue(2);
  });

  test('DIRECTOR widgets include pedagogy and finance overview', async () => {
    const result = await loadRoleDashboard('DIRECTOR', SCHOOL, SCHOOL.currentSchoolYear);
    expect(result.role).toBe('DIRECTOR');
    expect(result.widgets.pendingPayments).toBe(2);
    expect(result.widgets.unpaidTotal).toBe(8000);
    expect(result.widgets.analyse).toBeTruthy();
    expect(result.widgets.riskWidget.counts.ELEVE).toBe(1);
  });

  test('SECRETARIAT widgets focus on enrollments, bulletins, caisse, documents', async () => {
    const result = await loadRoleDashboard('SECRETARIAT', SCHOOL, SCHOOL.currentSchoolYear);
    expect(result.role).toBe('SECRETARIAT');
    expect(result.widgets.pendingEnrollments).toBe(1);
    expect(result.widgets.bulletinsToGenerate).toBe(1);
    expect(result.widgets.convocationsUpcoming).toBe(3);
    expect(result.widgets.caisseToday.total).toBe(10000);
    expect(result.widgets.pendingDocuments).toBe(4);
  });

  test('ACCOUNTANT widgets focus on payments and accounting', async () => {
    const result = await loadRoleDashboard('ACCOUNTANT', SCHOOL, SCHOOL.currentSchoolYear);
    expect(result.role).toBe('ACCOUNTANT');
    expect(result.widgets.pendingPayments).toBe(2);
    expect(result.widgets.paymentsTodayCount).toBe(2);
    expect(result.widgets.accountingEntriesMonth).toBe(12);
    expect(result.widgets.payrollRun.totalNet).toBe(900000);
  });

  test('EDUCATOR widgets focus on absences, social cases, discipline, risk', async () => {
    const result = await loadRoleDashboard('EDUCATOR', SCHOOL, SCHOOL.currentSchoolYear);
    expect(result.role).toBe('EDUCATOR');
    expect(result.widgets.absencesToday).toBe(2);
    expect(result.widgets.activeSocialCases).toBe(5);
    expect(result.widgets.disciplineIncidents).toBe(1);
    expect(result.widgets.riskWidget).toBeTruthy();
  });

  test('LIFE_SCHOOL widgets focus on retards, cantine, activities, lost items', async () => {
    const result = await loadRoleDashboard('LIFE_SCHOOL', SCHOOL, SCHOOL.currentSchoolYear);
    expect(result.role).toBe('LIFE_SCHOOL');
    expect(result.widgets.latesToday).toBe(2);
    expect(result.widgets.canteenMenu.menu).toMatch(/Riz/);
    expect(result.widgets.activitiesCount).toBe(6);
    expect(result.widgets.lostItemsOpen).toBe(2);
  });

  test('countBulletinsToGenerate counts students with grades but no bulletin', async () => {
    const count = await countBulletinsToGenerate(SCHOOL_ID, 'T1');
    expect(count).toBe(1);
  });
});

describe('dashboard view by role', () => {
  const dashboardPath = path.join(__dirname, '../views/school/dashboard.ejs');
  const dashboardTpl = fs.readFileSync(dashboardPath, 'utf8');

  function renderDashboard(staffRole, extra = {}) {
    const ctx = attachStaffContext(staffUser(staffRole), SCHOOL_ID);
    return ejs.render(
      dashboardTpl,
      {
        _inLayout: true,
        user: staffUser(staffRole),
        school: SCHOOL,
        staffRole,
        staffRoleLabel: ctx.staffRoleLabel,
        staffCan: ctx.staffCan,
        stats: { classes: 5, students: 120, teachers: 10, pendingPayments: 2 },
        recentPayments: [],
        roleWidgets: extra.roleWidgets || {},
        analyse: extra.analyse || null,
        riskWidget: extra.riskWidget || null,
        formatMoney: (n) => `${n} FCFA`,
        termLabel: (t) => t,
      },
      { filename: dashboardPath },
    );
  }

  test('SECRETARIAT dashboard shows inscriptions and caisse widgets', () => {
    const html = renderDashboard('SECRETARIAT', {
      roleWidgets: {
        pendingEnrollments: 7,
        bulletinsToGenerate: 12,
        convocationsUpcoming: 2,
        pendingDocuments: 3,
        caisseToday: { total: 50000, count: 4 },
        termLabel: 'Trimestre 1',
      },
    });
    expect(html).toContain('Inscriptions en attente');
    expect(html).toContain('Caisse aujourd’hui');
    expect(html).not.toContain('Analyse pédagogique');
    expect(html).not.toContain('Comptabilité');
  });

  test('ACCOUNTANT dashboard shows accounting link and hides bulletin action', () => {
    const html = renderDashboard('ACCOUNTANT', {
      roleWidgets: {
        pendingPayments: 4,
        unpaidTotal: 100000,
        paymentsTodayTotal: 20000,
        paymentsTodayCount: 2,
        accountingEntriesMonth: 8,
      },
    });
    expect(html).toContain('Paiements à valider');
    expect(html).toContain('/school/accounting');
    expect(html).not.toContain('Générer bulletins');
  });

  test('EDUCATOR dashboard shows absences and cas sociaux actions', () => {
    const html = renderDashboard('EDUCATOR', {
      roleWidgets: { absencesToday: 3, latesToday: 1, activeSocialCases: 2, disciplineIncidents: 1 },
      riskWidget: { counts: { ELEVE: 1, MOYEN: 0, FAIBLE: 0 }, term: 'T1', rows: [] },
    });
    expect(html).toContain('Absences aujourd’hui');
    expect(html).toContain('/school/cas-sociaux');
    expect(html).not.toContain('/school/settings');
  });

  test('DIRECTOR dashboard keeps pedagogy section', () => {
    const html = renderDashboard('DIRECTOR', {
      roleWidgets: { pendingPayments: 2, deliberationsPending: 5, termLabel: 'Trimestre 1' },
      analyse: {
        schoolYear: '2025-2026',
        gender: { boys: 1, girls: 2 },
        absenceByGender: { boys: 0, girls: 0 },
        successByGender: { boys: { averageOn20: 10 }, girls: { averageOn20: 11 } },
        reinscription: { promoted: 1, repeated: 0 },
      },
      riskWidget: { counts: { ELEVE: 0, MOYEN: 0, FAIBLE: 0 }, term: 'T1', rows: [] },
    });
    expect(html).toContain('Analyse pédagogique');
    expect(html).toContain('Délibérations en attente');
  });
});

describe('permission denied page', () => {
  test('requirePermission renders friendly French page', async () => {
    resolveSchoolId.mockResolvedValueOnce(SCHOOL_ID);
    const req = {
      user: staffUser('ACCOUNTANT'),
      originalUrl: '/school/settings',
      accepts: () => 'html',
    };
    const res = {
      locals: { staffRoleLabel: 'Comptabilité' },
      statusCode: null,
      view: null,
      status(code) { this.statusCode = code; return this; },
      render(view, data) { this.view = view; this.body = data; return this; },
    };
    const next = jest.fn();
    await requirePermission(PERMISSIONS.SETTINGS_WRITE)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.view).toBe('permission-denied');
    expect(res.body.message).toMatch(/rôle/i);
    expect(res.body.staffRoleLabel).toBe('Comptabilité');
  });
});
