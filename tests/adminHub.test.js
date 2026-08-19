jest.mock('../src/config/database', () => ({
  school: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  organization: { findMany: jest.fn(), findUnique: jest.fn() },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  schoolModule: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    createMany: jest.fn(),
  },
  student: { count: jest.fn() },
  transferRequest: { count: jest.fn() },
  quoteRequest: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  auditTrail: { create: jest.fn() },
}));

jest.mock('../src/utils/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  auditMiddleware: () => (_req, _res, next) => next(),
  writeAuditTrail: jest.fn(),
  listAuditTrail: jest.fn(),
  isSensitiveAction: () => false,
}));

jest.mock('../services/ClassService', () => ({
  getGenderStatsBySchool: jest.fn().mockResolvedValue({ schools: [] }),
}));

const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const { signToken } = require('../src/utils/jwt');

const SCHOOL = {
  id: 'sch-1',
  name: 'IGEST',
  slug: 'igest-yopougon-sideci',
  city: 'Abidjan',
  educationCycle: 'COLLEGE',
  marketplaceTier: 'NONE',
  publicFeatured: false,
  publicPortalEnabled: false,
  smsSenderId: null,
  subscription: 'premium',
};

const ADMIN = {
  id: 'admin-1',
  email: 'assoheddy@gmail.com',
  role: 'SUPER_ADMIN',
  firstName: 'Eddy',
  lastName: 'Assoh',
  isActive: true,
  school: null,
  teacher: null,
  parentProfile: null,
  organizationAdmin: null,
};

const PARENT = {
  id: 'parent-1',
  email: 'parent@demo.ci',
  role: 'PARENT',
  firstName: 'Parent',
  lastName: 'Demo',
  isActive: true,
  school: null,
  teacher: null,
  parentProfile: { id: 'pp-1' },
  organizationAdmin: null,
};

const NEW_GET_ROUTES = [
  '/admin/users',
  '/admin/quotes',
  '/admin/marketplace',
  '/admin/schools',
  '/admin/schools/sch-1',
];

function cookieFor(user) {
  return `token=${signToken({ userId: user.id, role: user.role })}`;
}

describe('SUPER_ADMIN hub — authz', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.school.findUnique.mockResolvedValue(SCHOOL);
    prisma.school.findMany.mockResolvedValue([]);
    prisma.school.update.mockImplementation(async ({ data }) => ({ ...SCHOOL, ...data }));
    prisma.schoolModule.findMany.mockResolvedValue([]);
    prisma.schoolModule.upsert.mockResolvedValue({});
    prisma.schoolModule.createMany.mockResolvedValue({ count: 0 });
    prisma.quoteRequest.findMany.mockResolvedValue([]);
    prisma.quoteRequest.findUnique.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.auditLog.create.mockResolvedValue({});
  });

  test('unauthenticated visitors cannot skip auth on new admin routes', async () => {
    for (const path of NEW_GET_ROUTES) {
      const res = await request(app).get(path);
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/auth\/login/);
    }
    const patch = await request(app)
      .patch('/admin/schools/sch-1')
      .send({ educationCycle: 'LYCEE', marketplaceTier: 'VIP' });
    expect(patch.status).toBe(302);
    expect(patch.headers.location).toMatch(/\/auth\/login/);
    expect(prisma.school.update).not.toHaveBeenCalled();
  });

  test('parent receives 403 on new admin routes', async () => {
    prisma.user.findUnique.mockResolvedValue(PARENT);
    const cookie = cookieFor(PARENT);
    for (const path of NEW_GET_ROUTES) {
      const res = await request(app).get(path).set('Cookie', cookie);
      expect(res.status).toBe(403);
      expect(res.text).toMatch(/Forbidden/i);
    }
  });

  test('parent cannot PATCH cycle or marketplace tier', async () => {
    prisma.user.findUnique.mockResolvedValue(PARENT);
    const res = await request(app)
      .patch('/admin/schools/sch-1')
      .set('Cookie', cookieFor(PARENT))
      .send({ educationCycle: 'LYCEE', marketplaceTier: 'VIP' });
    expect(res.status).toBe(403);
    expect(prisma.school.update).not.toHaveBeenCalled();
  });

  test('SUPER_ADMIN can PATCH cycle and marketplace tier without assist', async () => {
    prisma.user.findUnique.mockResolvedValue(ADMIN);
    const res = await request(app)
      .patch('/admin/schools/sch-1')
      .set('Cookie', cookieFor(ADMIN))
      .send({ educationCycle: 'LYCEE', marketplaceTier: 'VIP' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.educationCycle).toBe('LYCEE');
    expect(res.body.marketplaceTier).toBe('VIP');
    expect(prisma.school.update).toHaveBeenCalled();
    const cycleUpdate = prisma.school.update.mock.calls.find((call) => call[0].data?.educationCycle);
    expect(cycleUpdate[0].data.educationCycle).toBe('LYCEE');
    const tierUpdate = prisma.school.update.mock.calls.find((call) => call[0].data?.marketplaceTier === 'VIP');
    expect(tierUpdate).toBeTruthy();
  });
});
