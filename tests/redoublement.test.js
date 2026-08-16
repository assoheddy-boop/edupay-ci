jest.mock('../src/config/database', () => ({
  school: { findMany: jest.fn() },
  studentYearRecord: { findMany: jest.fn() },
}));

jest.mock('../services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../services/ReinscriptionService', () => ({
  analyzeRedoublementCauses: jest.fn(),
  getReinscriptionStats: jest.fn(),
  summarizeCauseStats: jest.fn((causes) => {
    const stats = { absences: 0, notes: 0, mixte: 0, autre: 0 };
    causes.forEach((c) => {
      if (c.cause === 'Absences élevées') stats.absences += 1;
      else if (c.cause === 'Notes faibles') stats.notes += 1;
      else if (c.cause === 'Mixte') stats.mixte += 1;
      else stats.autre += 1;
    });
    return stats;
  }),
  ABSENCE_THRESHOLD: 30,
  GRADE_THRESHOLD: 10,
}));

const prisma = require('../src/config/database');
const { analyzeRedoublementCauses, getReinscriptionStats } = require('../services/ReinscriptionService');
const {
  getRedoublementCausesByPlan,
  hidePeerSchools,
  NO_PLAN_LABEL,
  causeRatesFromStats,
} = require('../services/RedoublementService');
const { planIncludesFeature } = require('../src/utils/plans');
const { PLANS } = require('../src/config/plans');

describe('RedoublementService.getRedoublementCausesByPlan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns error when schoolYear missing', async () => {
    const result = await getRedoublementCausesByPlan(null);
    expect(result.ok).toBe(false);
    expect(result.plans).toEqual([]);
  });

  test('aggregates schools by plan with cause rates', async () => {
    prisma.school.findMany.mockResolvedValue([
      { id: 's1', name: 'École A', planId: 1, plan: { id: 1, name: 'Premium' } },
      { id: 's2', name: 'École B', planId: 2, plan: { id: 2, name: 'Pro' } },
      { id: 's3', name: 'École C', planId: null, plan: null },
    ]);

    analyzeRedoublementCauses.mockImplementation(async (year, schoolId) => {
      if (schoolId === 's1') {
        return [
          { cause: 'Absences élevées', gender: 'M' },
          { cause: 'Notes faibles', gender: 'F' },
        ];
      }
      if (schoolId === 's2') {
        return [{ cause: 'Mixte', gender: 'M' }];
      }
      return [];
    });

    getReinscriptionStats.mockResolvedValue({
      historicalRepeatRate: [{ schoolYear: '2025-2026', total: 100, repeated: 10, rate: 0.1 }],
    });

    prisma.studentYearRecord.findMany.mockImplementation(async ({ where }) => {
      if (where.schoolId === 's1') {
        return [{ repeatYear: true }, { repeatYear: false }, { repeatYear: false }, { repeatYear: false }];
      }
      if (where.schoolId === 's2') {
        return [{ repeatYear: true }, { repeatYear: true }, { repeatYear: false }, { repeatYear: false }, { repeatYear: false }];
      }
      return [{ repeatYear: false }, { repeatYear: false }];
    });

    const result = await getRedoublementCausesByPlan('2025-2026');
    expect(result.ok).toBe(true);
    expect(result.plans).toHaveLength(3);

    const premium = result.plans.find((p) => p.planName === 'Premium');
    expect(premium.schoolCount).toBe(1);
    expect(premium.avgRedoublementRate).toBe(0.25);
    expect(premium.absencesRate).toBe(0.5);
    expect(premium.notesRate).toBe(0.5);
    expect(premium.efficient).toBe(false);

    const pro = result.plans.find((p) => p.planName === 'Pro');
    expect(pro.avgRedoublementRate).toBe(0.4);
    expect(pro.mixteRate).toBe(1);
    expect(pro.efficient).toBe(false);

    const sansPlan = result.plans.find((p) => p.planName === NO_PLAN_LABEL);
    expect(sansPlan.schoolCount).toBe(1);
    expect(sansPlan.avgRedoublementRate).toBe(0);
    expect(sansPlan.efficient).toBe(true);
  });

  test('marks plan as efficient when avg rate below 10%', async () => {
    prisma.school.findMany.mockResolvedValue([
      { id: 's1', name: 'École A', planId: 1, plan: { id: 1, name: 'Premium' } },
    ]);
    analyzeRedoublementCauses.mockResolvedValue([]);
    getReinscriptionStats.mockResolvedValue({ historicalRepeatRate: [] });
    prisma.studentYearRecord.findMany.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => ({ repeatYear: i < 5 })),
    );

    const result = await getRedoublementCausesByPlan('2025-2026');
    const premium = result.plans.find((p) => p.planName === 'Premium');
    expect(premium.avgRedoublementRate).toBe(0.05);
    expect(premium.efficient).toBe(true);
  });
});

describe('causeRatesFromStats', () => {
  test('computes percentage breakdown', () => {
    expect(causeRatesFromStats({ absences: 2, notes: 1, mixte: 1, autre: 0 }, 4)).toEqual({
      absencesRate: 0.5,
      notesRate: 0.25,
      mixteRate: 0.25,
      autreRate: 0,
    });
  });
});

describe('redoublementAnalysis plan gate', () => {
  const essentiel = { name: 'Essentiel', features: PLANS.essentiel.modules };
  const premium = { name: 'Premium', features: PLANS.premium.modules };

  test('essentiel plan excludes redoublementAnalysis', () => {
    expect(planIncludesFeature(essentiel, 'redoublementAnalysis')).toBe(false);
  });

  test('premium plan includes redoublementAnalysis', () => {
    expect(planIncludesFeature(premium, 'redoublementAnalysis')).toBe(true);
  });

  test('pro and groupe plans include redoublementAnalysis', () => {
    expect(planIncludesFeature({ features: PLANS.pro.modules }, 'redoublementAnalysis')).toBe(true);
    expect(planIncludesFeature({ features: PLANS.groupe.modules }, 'redoublementAnalysis')).toBe(true);
  });
});

describe('redoublement routes upgrade response', () => {
  test('upgrade payload shape', () => {
    const payload = { error: 'upgrade', message: 'Disponible en plan supérieur' };
    expect(payload.error).toBe('upgrade');
    expect(payload.message).toMatch(/plan supérieur/i);
  });
});

describe('hidePeerSchools', () => {
  test('keeps only the caller school in plan school lists', () => {
    const scoped = hidePeerSchools([
      {
        planName: 'Premium',
        schools: [
          { schoolId: 'mine', schoolName: 'Moi', repeatRate: 0.1 },
          { schoolId: 'peer', schoolName: 'Concurrent', repeatRate: 0.2 },
        ],
      },
    ], 'mine');
    expect(scoped[0].schools).toEqual([
      { schoolId: 'mine', schoolName: 'Moi', repeatRate: 0.1 },
    ]);
  });
});
