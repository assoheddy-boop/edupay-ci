jest.mock('../src/config/database', () => ({
  user: { findUnique: jest.fn() },
  school: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  ecoleCorrespondance: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  messageCorrespondance: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  projetCorrespondance: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  calendrierCorrespondance: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  teacher: {
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
}));

jest.mock('../src/config/socket', () => ({
  emitToUser: jest.fn(),
  emitCorrespondanceMessage: jest.fn(),
  emitCorrespondanceProjet: jest.fn(),
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
    res.locals.modules = { correspondance: { enabled: true, label: 'Correspondance scolaire' } };
    res.locals.isModuleEnabled = () => true;
    next();
  },
  requireModule: () => (_req, _res, next) => next(),
  resolveSchoolId: jest.fn().mockResolvedValue('sch-ci'),
}));

const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const correspondance = require('../src/services/correspondance');
const { MODULES, MODULE_KEYS } = require('../src/config/modules');
const { signToken } = require('../src/utils/jwt');

const SCHOOL_ADMIN = {
  id: 'u-school',
  email: 'ecole@demo.ci',
  role: 'SCHOOL_ADMIN',
  isActive: true,
  firstName: 'Directeur',
  lastName: 'Demo',
  school: { id: 'sch-ci', name: 'École CI', correspondanceCountry: 'CI', educationCycle: 'COLLEGE' },
  staffAssignments: [],
  teacher: null,
  parentProfile: null,
  organizationAdmin: null,
  student: null,
};

function authCookie(user) {
  return `token=${signToken({ userId: user.id, role: user.role })}`;
}

describe('Correspondance module config', () => {
  test('correspondance module is registered with default enabled', () => {
    expect(MODULE_KEYS).toContain('correspondance');
    expect(MODULES.correspondance.label).toBe('Correspondance scolaire');
    expect(MODULES.correspondance.default).toBe(true);
  });
});

describe('Correspondance routes auth', () => {
  test('GET /correspondance redirects unauthenticated users', async () => {
    const res = await request(app).get('/correspondance');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/login/);
  });

  test('POST /correspondance/jumelage redirects unauthenticated users', async () => {
    const res = await request(app)
      .post('/correspondance/jumelage')
      .type('form')
      .send({ partenaireId: 'x' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/login/);
  });

  test('POST /correspondance/message redirects unauthenticated users', async () => {
    const res = await request(app)
      .post('/correspondance/message')
      .type('form')
      .send({ jumelageId: 'j1', destinataireId: 'u1', contenu: 'Bonjour' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/login/);
  });

  test('POST /correspondance/projet redirects unauthenticated users', async () => {
    const res = await request(app)
      .post('/correspondance/projet')
      .type('form')
      .send({ jumelageId: 'j1', titre: 'Exposé' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/login/);
  });

  test('GET /correspondance renders dashboard for authenticated school admin', async () => {
    prisma.user = { findUnique: jest.fn().mockResolvedValue(SCHOOL_ADMIN) };
    prisma.school.findUnique.mockResolvedValue({ id: 'sch-ci', name: 'École CI', correspondanceCountry: 'CI' });
    prisma.ecoleCorrespondance.findMany.mockResolvedValue([]);
    prisma.school.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/correspondance')
      .set('Cookie', authCookie(SCHOOL_ADMIN));

    expect(res.status).toBe(200);
    expect(res.text).toContain('Correspondance scolaire');
    expect(res.text).toContain('Demander un jumelage');
  });
});

describe('correspondance service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requestJumelage rejects same country pairing', async () => {
    prisma.school.findUnique
      .mockResolvedValueOnce({ id: 'ci1', correspondanceCountry: 'CI' })
      .mockResolvedValueOnce({ id: 'ci2', correspondanceCountry: 'CI' });

    await expect(correspondance.requestJumelage({
      ecoleId: 'ci1',
      partenaireId: 'ci2',
      requestedById: 'u1',
    })).rejects.toMatchObject({ status: 400 });
  });

  test('requestJumelage stores CI school as ecoleId and FR as partenaireId', async () => {
    prisma.school.findUnique
      .mockResolvedValueOnce({ id: 'fr1', correspondanceCountry: 'FR' })
      .mockResolvedValueOnce({ id: 'ci1', correspondanceCountry: 'CI' });
    prisma.ecoleCorrespondance.findFirst.mockResolvedValue(null);
    prisma.ecoleCorrespondance.create.mockResolvedValue({ id: 'j1', ecoleId: 'ci1', partenaireId: 'fr1' });

    const result = await correspondance.requestJumelage({
      ecoleId: 'fr1',
      partenaireId: 'ci1',
      requestedById: 'u1',
    });

    expect(prisma.ecoleCorrespondance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ecoleId: 'ci1', partenaireId: 'fr1', status: 'PENDING' }),
      }),
    );
    expect(result.id).toBe('j1');
  });

  test('sendMessage requires approved jumelage', async () => {
    prisma.ecoleCorrespondance.findUnique.mockResolvedValue({
      id: 'j1',
      ecoleId: 'ci1',
      partenaireId: 'fr1',
      status: 'PENDING',
    });

    await expect(correspondance.sendMessage({
      jumelageId: 'j1',
      schoolId: 'ci1',
      expediteurId: 'u1',
      destinataireId: 'u2',
      contenu: 'Test',
    })).rejects.toMatchObject({ status: 403 });
  });
});
