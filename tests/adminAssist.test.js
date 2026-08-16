jest.mock('../src/config/database', () => ({
  school: { findUnique: jest.fn(), findMany: jest.fn() },
  organization: { findUnique: jest.fn() },
  parentStudent: { findMany: jest.fn() },
  schoolModule: { findMany: jest.fn(), createMany: jest.fn() },
  user: { findUnique: jest.fn() },
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
  isSensitiveAction: (action) => String(action || '').startsWith('admin_assist'),
}));

jest.mock('../src/utils/plans', () => ({
  getSchoolPlan: jest.fn(),
  planIncludesFeature: jest.fn(),
}));

const prisma = require('../src/config/database');
const { logAudit } = require('../src/utils/audit');
const { getSchoolPlan, planIncludesFeature } = require('../src/utils/plans');
const { signToken } = require('../src/utils/jwt');
const { ASSIST_COOKIE } = require('../src/utils/cookies');
const {
  bypassPlanAndModules,
  hasEffectiveRole,
  attachAdminAssist,
  beginSchoolAssist,
  beginGroupAssist,
  stopAssist,
  applySchoolAssist,
} = require('../src/utils/adminAssist');
const { requirePlan } = require('../src/middleware/plan');
const { requireModule, enableAllModulesMap } = require('../src/middleware/modules');
const { checkRole } = require('../src/middleware/auth');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    view: null,
    redirectTo: null,
    cookies: {},
    cleared: [],
    cookie(name, value) { this.cookies[name] = value; return this; },
    clearCookie(name) { this.cleared.push(name); return this; },
    status(code) { this.statusCode = code; return this; },
    send(text) { this.body = text; return this; },
    render(view) { this.view = view; return this; },
    redirect(url) { this.redirectTo = url; return this; },
  };
}

describe('hasEffectiveRole / bypassPlanAndModules', () => {
  test('SUPER_ADMIN bypasses plan and module gates', () => {
    expect(bypassPlanAndModules({ role: 'SUPER_ADMIN' })).toBe(true);
  });

  test('SCHOOL_ADMIN does not bypass even with a fake assist flag', () => {
    expect(bypassPlanAndModules({ role: 'SCHOOL_ADMIN' })).toBe(false);
    expect(bypassPlanAndModules({
      role: 'SCHOOL_ADMIN',
      adminAssist: { type: 'school' },
    })).toBe(false);
  });

  test('SUPER_ADMIN assisting a school has SCHOOL_ADMIN powers, not parent', () => {
    const user = { role: 'SUPER_ADMIN', adminAssist: { type: 'school', schoolId: 'sch_1' } };
    expect(hasEffectiveRole(user, 'SUPER_ADMIN')).toBe(true);
    expect(hasEffectiveRole(user, 'SCHOOL_ADMIN')).toBe(true);
    expect(hasEffectiveRole(user, 'ORGANIZATION_ADMIN')).toBe(false);
    expect(hasEffectiveRole(user, 'PARENT')).toBe(false);
  });

  test('PARENT cannot gain school powers via a fake assist flag', () => {
    const user = { role: 'PARENT', adminAssist: { type: 'school', schoolId: 'sch_1' } };
    expect(hasEffectiveRole(user, 'SCHOOL_ADMIN')).toBe(false);
    expect(bypassPlanAndModules(user)).toBe(false);
  });
});

describe('checkRole with admin assist', () => {
  test('allows SUPER_ADMIN with school assist on school routes', () => {
    const req = { user: { role: 'SUPER_ADMIN', adminAssist: { type: 'school' } } };
    const res = mockRes();
    const next = jest.fn();
    checkRole('school')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  test('forbids SUPER_ADMIN on school routes without assist', () => {
    const req = { user: { role: 'SUPER_ADMIN' } };
    const res = mockRes();
    const next = jest.fn();
    checkRole('school')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toBe('Forbidden');
  });

  test('forbids PARENT on school routes', () => {
    const req = { user: { role: 'PARENT' } };
    const res = mockRes();
    const next = jest.fn();
    checkRole('school')(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows SUPER_ADMIN with group assist on group routes', () => {
    const req = { user: { role: 'SUPER_ADMIN', adminAssist: { type: 'group' } } };
    const res = mockRes();
    const next = jest.fn();
    checkRole('group')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('requirePlan / requireModule bypass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('SUPER_ADMIN skips plan check even without a school', async () => {
    const req = { user: { role: 'SUPER_ADMIN' } };
    const res = mockRes();
    const next = jest.fn();
    await requirePlan('hr')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(getSchoolPlan).not.toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  test('SCHOOL_ADMIN is still blocked when the plan omits the module', async () => {
    getSchoolPlan.mockResolvedValue({ features: [] });
    planIncludesFeature.mockReturnValue(false);
    const req = { user: { role: 'SCHOOL_ADMIN', school: { id: 'sch_1' } } };
    const res = mockRes();
    const next = jest.fn();
    await requirePlan('accounting')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.view).toBe('school/module-disabled');
  });

  test('requireModule second gate is skipped for SUPER_ADMIN assist', async () => {
    const chain = requireModule('hr');
    const req = {
      user: {
        role: 'SUPER_ADMIN',
        adminAssist: { type: 'school', schoolId: 'sch_1' },
        school: { id: 'sch_1' },
      },
    };
    const res = mockRes();
    const next = jest.fn();
    await chain[1](req, res, next);
    expect(next).toHaveBeenCalled();
    expect(prisma.schoolModule.findMany).not.toHaveBeenCalled();
  });

  test('enableAllModulesMap turns every module on', () => {
    const map = enableAllModulesMap({ accounting: { enabled: false, label: 'Compta' } });
    expect(map.accounting.enabled).toBe(true);
    expect(map.hr.enabled).toBe(true);
    expect(map.payments.enabled).toBe(true);
  });
});

describe('impersonation start / stop', () => {
  const superAdmin = { id: 'user_admin', role: 'SUPER_ADMIN', email: 'assoheddy@gmail.com' };
  const school = { id: 'sch_cuid_1', name: 'École Étoile' };
  const organization = { id: 'org_cuid_1', name: 'Groupe Les Étoiles' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('beginSchoolAssist sets cookie, audits, and redirects to school dashboard', async () => {
    prisma.school.findUnique.mockResolvedValue(school);
    const req = { user: superAdmin, params: { id: school.id }, ip: '127.0.0.1' };
    const res = mockRes();
    const result = await beginSchoolAssist(req, res);
    expect(result.ok).toBe(true);
    expect(result.redirect).toBe('/school/dashboard');
    expect(res.cookies[ASSIST_COOKIE]).toBeTruthy();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'admin_assist_start',
      entity: 'School',
      entityId: school.id,
      schoolId: school.id,
    }));
  });

  test('beginGroupAssist sets cookie for the organization', async () => {
    prisma.organization.findUnique.mockResolvedValue(organization);
    const req = { user: superAdmin, params: { id: organization.id }, ip: '127.0.0.1' };
    const res = mockRes();
    const result = await beginGroupAssist(req, res);
    expect(result.ok).toBe(true);
    expect(result.redirect).toBe('/group/dashboard');
    expect(res.cookies[ASSIST_COOKIE]).toBeTruthy();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'admin_assist_start',
      entity: 'Organization',
      entityId: organization.id,
    }));
  });

  test('non-admin cannot start school assist', async () => {
    const req = { user: { id: 'u2', role: 'SCHOOL_ADMIN' }, params: { id: school.id } };
    const res = mockRes();
    const result = await beginSchoolAssist(req, res);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(prisma.school.findUnique).not.toHaveBeenCalled();
    expect(res.cookies[ASSIST_COOKIE]).toBeUndefined();
  });

  test('PARENT cannot start group assist', async () => {
    const req = { user: { id: 'u3', role: 'PARENT' }, params: { id: organization.id } };
    const res = mockRes();
    const result = await beginGroupAssist(req, res);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  test('stopAssist clears the cookie and returns to /admin', async () => {
    const req = {
      user: applySchoolAssist({ ...superAdmin }, school),
      ip: '127.0.0.1',
    };
    const res = mockRes();
    const result = await stopAssist(req, res);
    expect(result.ok).toBe(true);
    expect(result.redirect).toBe('/admin/dashboard');
    expect(res.cleared).toContain(ASSIST_COOKIE);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'admin_assist_stop',
      entity: 'School',
    }));
    expect(req.user.role).toBe('SUPER_ADMIN');
  });

  test('attachAdminAssist loads the school for the owning SUPER_ADMIN', async () => {
    prisma.school.findUnique.mockResolvedValue(school);
    const token = signToken({ uid: superAdmin.id, t: 'school', sid: school.id });
    const req = { cookies: { [ASSIST_COOKIE]: token } };
    const res = mockRes();
    const user = { ...superAdmin };
    await attachAdminAssist(req, res, user);
    expect(user.adminAssist).toEqual(expect.objectContaining({ type: 'school', schoolId: school.id }));
    expect(user.school.id).toBe(school.id);
    expect(user.role).toBe('SUPER_ADMIN');
  });

  test('attachAdminAssist ignores a cookie bound to another user', async () => {
    const token = signToken({ uid: 'someone_else', t: 'school', sid: school.id });
    const req = { cookies: { [ASSIST_COOKIE]: token } };
    const res = mockRes();
    const user = { ...superAdmin };
    await attachAdminAssist(req, res, user);
    expect(user.adminAssist).toBeUndefined();
    expect(user.school).toBeUndefined();
    expect(res.cleared).toContain(ASSIST_COOKIE);
    expect(prisma.school.findUnique).not.toHaveBeenCalled();
  });

  test('attachAdminAssist ignores the cookie for a SCHOOL_ADMIN', async () => {
    const token = signToken({ uid: 'user_school', t: 'school', sid: school.id });
    const req = { cookies: { [ASSIST_COOKIE]: token } };
    const res = mockRes();
    const user = { id: 'user_school', role: 'SCHOOL_ADMIN' };
    await attachAdminAssist(req, res, user);
    expect(user.adminAssist).toBeUndefined();
    expect(prisma.school.findUnique).not.toHaveBeenCalled();
  });
});
