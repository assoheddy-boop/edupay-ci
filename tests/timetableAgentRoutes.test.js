jest.mock('../src/controllers/timetableAgentController', () => ({
  index: (_req, res) => res.status(200).send('Assistant emploi du temps'),
  newSession: (_req, res) => res.redirect('/school/timetable-agent/new-id'),
  show: (_req, res) => res.status(200).send('Session'),
  saveDraft: (_req, res) => res.redirect('/school/timetable-agent/x'),
  runGenerate: (_req, res) => res.redirect('/school/timetable-agent/x'),
  applySession: (_req, res) => res.redirect('/school/timetable-agent/x'),
  preview: (_req, res) => res.status(200).send('Preview'),
  deleteSession: (_req, res) => res.redirect('/school/timetable-agent'),
}));

jest.mock('../src/config/database', () => ({
  user: { findUnique: jest.fn() },
  timetableGenerationSession: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../src/utils/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  auditMiddleware: () => (_req, _res, next) => next(),
  writeAuditTrail: jest.fn(),
  listAuditTrail: jest.fn(),
  isSensitiveAction: () => false,
}));

jest.mock('../src/middleware/modules', () => ({
  attachModules: (_req, res, next) => {
    res.locals.modules = {};
    res.locals.isModuleEnabled = () => true;
    next();
  },
  requireModule: () => (_req, _res, next) => next(),
  resolveSchoolId: jest.fn().mockResolvedValue('sch-demo'),
}));

const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const { signToken } = require('../src/utils/jwt');

const SCHOOL_ADMIN = {
  id: 'u-school',
  email: 'ecole@demo.ci',
  role: 'SCHOOL_ADMIN',
  isActive: true,
  firstName: 'Directeur',
  lastName: 'Demo',
  school: {
    id: 'sch-demo',
    name: 'École Demo',
    adminId: 'u-school',
    currentSchoolYear: '2025-2026',
  },
  staffAssignments: [],
  teacher: null,
  parentProfile: null,
  organizationAdmin: null,
  student: null,
};

const TEACHER = {
  id: 'u-teacher',
  email: 'prof@demo.ci',
  role: 'TEACHER',
  isActive: true,
  firstName: 'Prof',
  lastName: 'Demo',
  school: null,
  staffAssignments: [],
  teacher: { id: 't1', schoolId: 'sch-demo', school: { id: 'sch-demo', name: 'École Demo' } },
  parentProfile: null,
  organizationAdmin: null,
  student: null,
};

function authCookie(user) {
  return `token=${signToken({ userId: user.id, role: user.role })}`;
}

describe('timetable-agent routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.timetableGenerationSession.findMany.mockResolvedValue([]);
  });

  test('GET /school/timetable-agent redirects unauthenticated users', async () => {
    const res = await request(app).get('/school/timetable-agent');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/login/);
  });

  test('GET /school/timetable-agent renders for school admin', async () => {
    prisma.user.findUnique.mockResolvedValue(SCHOOL_ADMIN);

    const res = await request(app)
      .get('/school/timetable-agent')
      .set('Cookie', authCookie(SCHOOL_ADMIN));

    expect(res.status).toBe(200);
    expect(res.text).toContain('Assistant emploi du temps');
  });

  test('GET /school/timetable-agent returns French error page for teacher', async () => {
    prisma.user.findUnique.mockResolvedValue(TEACHER);

    const res = await request(app)
      .get('/school/timetable-agent')
      .set('Cookie', authCookie(TEACHER));

    expect(res.status).toBe(403);
    expect(res.text).toContain('Accès refusé');
    expect(res.text).not.toBe('Forbidden');
  });
});
