const {
  PERMISSIONS,
  STAFF_ROLE_LABELS,
  ROLE_PERMISSIONS,
  getEffectiveStaffRole,
  getPermissionsForRole,
  hasPermission,
  attachStaffContext,
  isSchoolPrimaryAdmin,
} = require('../src/utils/staffPermissions');
const { requirePermission } = require('../src/middleware/requirePermission');

jest.mock('../src/middleware/modules', () => ({
  resolveSchoolId: jest.fn(async (user) => user?.school?.id || user?.staffAssignments?.[0]?.schoolId || null),
}));

const { resolveSchoolId } = require('../src/middleware/modules');

const SCHOOL_ID = 'sch-test';

function schoolAdmin(overrides = {}) {
  return {
    id: 'u-director',
    role: 'SCHOOL_ADMIN',
    school: { id: SCHOOL_ID, adminId: 'u-director' },
    staffAssignments: [],
    ...overrides,
  };
}

function staffUser(staffRole, overrides = {}) {
  return {
    id: 'u-staff',
    role: 'SCHOOL_ADMIN',
    school: null,
    staffAssignments: [{ schoolId: SCHOOL_ID, staffRole, school: { id: SCHOOL_ID } }],
    ...overrides,
  };
}

describe('staffPermissions matrix', () => {
  test('DIRECTOR has all permissions', () => {
    const perms = getPermissionsForRole('DIRECTOR');
    expect(perms).toContain(PERMISSIONS.SETTINGS_WRITE);
    expect(perms).toContain(PERMISSIONS.ACCOUNTING_WRITE);
    expect(perms).toContain(PERMISSIONS.HR_WRITE);
  });

  test('SECRETARIAT covers bulletins and caisse but not settings/hr/accounting', () => {
    const perms = getPermissionsForRole('SECRETARIAT');
    expect(perms).toContain(PERMISSIONS.BULLETINS_WRITE);
    expect(perms).toContain(PERMISSIONS.CAISSE);
    expect(perms).not.toContain(PERMISSIONS.SETTINGS_WRITE);
    expect(perms).not.toContain(PERMISSIONS.HR_READ);
    expect(perms).not.toContain(PERMISSIONS.ACCOUNTING_READ);
  });

  test('ACCOUNTANT is accounting-only', () => {
    const perms = getPermissionsForRole('ACCOUNTANT');
    expect(perms).toEqual(expect.arrayContaining([
      PERMISSIONS.ACCOUNTING_READ,
      PERMISSIONS.ACCOUNTING_WRITE,
    ]));
    expect(perms).not.toContain(PERMISSIONS.STUDENTS_WRITE);
    expect(perms).not.toContain(PERMISSIONS.SETTINGS_WRITE);
  });

  test('EDUCATOR covers absences and social cases', () => {
    const perms = getPermissionsForRole('EDUCATOR');
    expect(perms).toContain(PERMISSIONS.ABSENCES);
    expect(perms).toContain(PERMISSIONS.SOCIAL_CASES);
    expect(perms).not.toContain(PERMISSIONS.BULLETINS_WRITE);
  });

  test('LIFE_SCHOOL covers activities and discipline', () => {
    const perms = getPermissionsForRole('LIFE_SCHOOL');
    expect(perms).toContain(PERMISSIONS.ACTIVITIES);
    expect(perms).toContain(PERMISSIONS.DISCIPLINE);
    expect(perms).not.toContain(PERMISSIONS.ACCOUNTING_READ);
  });

  test('French labels exist for every role', () => {
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      expect(STAFF_ROLE_LABELS[role]).toBeTruthy();
    }
  });
});

describe('getEffectiveStaffRole', () => {
  test('primary SCHOOL_ADMIN is implicit DIRECTOR', () => {
    expect(getEffectiveStaffRole(schoolAdmin(), SCHOOL_ID)).toBe('DIRECTOR');
  });

  test('staff assignment returns assigned role', () => {
    expect(getEffectiveStaffRole(staffUser('SECRETARIAT'), SCHOOL_ID)).toBe('SECRETARIAT');
  });

  test('SUPER_ADMIN assisting school is DIRECTOR', () => {
    const user = {
      role: 'SUPER_ADMIN',
      adminAssist: { type: 'school', schoolId: SCHOOL_ID },
    };
    expect(getEffectiveStaffRole(user, SCHOOL_ID)).toBe('DIRECTOR');
  });

  test('TEACHER has no staff role', () => {
    expect(getEffectiveStaffRole({ role: 'TEACHER', teacher: { schoolId: SCHOOL_ID } }, SCHOOL_ID)).toBeNull();
  });
});

describe('hasPermission', () => {
  test('director can access settings', () => {
    expect(hasPermission(schoolAdmin(), PERMISSIONS.SETTINGS_WRITE, SCHOOL_ID)).toBe(true);
  });

  test('accountant cannot access settings', () => {
    expect(hasPermission(staffUser('ACCOUNTANT'), PERMISSIONS.SETTINGS_WRITE, SCHOOL_ID)).toBe(false);
  });

  test('accountant can access accounting', () => {
    expect(hasPermission(staffUser('ACCOUNTANT'), PERMISSIONS.ACCOUNTING_READ, SCHOOL_ID)).toBe(true);
  });

  test('secretariat can generate bulletins', () => {
    expect(hasPermission(staffUser('SECRETARIAT'), PERMISSIONS.BULLETINS_WRITE, SCHOOL_ID)).toBe(true);
  });

  test('super admin assist bypasses permission checks', () => {
    const user = {
      role: 'SUPER_ADMIN',
      adminAssist: { type: 'school', schoolId: SCHOOL_ID },
    };
    expect(hasPermission(user, PERMISSIONS.HR_WRITE, SCHOOL_ID)).toBe(true);
  });
});

describe('attachStaffContext', () => {
  test('exposes staffCan helper', () => {
    const ctx = attachStaffContext(staffUser('ACCOUNTANT'), SCHOOL_ID);
    expect(ctx.staffRole).toBe('ACCOUNTANT');
    expect(ctx.staffRoleLabel).toBe('Comptabilité');
    expect(ctx.staffCan(PERMISSIONS.ACCOUNTING_READ)).toBe(true);
    expect(ctx.staffCan(PERMISSIONS.SETTINGS_WRITE)).toBe(false);
  });
});

describe('requirePermission middleware', () => {
  function mockReq(user, url = '/school/test') {
    return {
      user,
      originalUrl: url,
      accepts: () => 'html',
    };
  }

  function mockRes() {
    return {
      locals: {},
      statusCode: null,
      view: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
      render(view, data) { this.view = view; this.body = data; return this; },
    };
  }

  test('allows director on settings', async () => {
    const req = mockReq(schoolAdmin(), '/school/settings');
    const res = mockRes();
    const next = jest.fn();
    await requirePermission(PERMISSIONS.SETTINGS_WRITE)(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('blocks accountant on settings', async () => {
    resolveSchoolId.mockResolvedValueOnce(SCHOOL_ID);
    const req = mockReq(staffUser('ACCOUNTANT'), '/school/settings');
    const res = mockRes();
    res.locals = { staffRoleLabel: 'Comptabilité' };
    const next = jest.fn();
    await requirePermission(PERMISSIONS.SETTINGS_WRITE)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.view).toBe('permission-denied');
  });

  test('allows accountant on accounting', async () => {
    resolveSchoolId.mockResolvedValueOnce(SCHOOL_ID);
    const req = mockReq(staffUser('ACCOUNTANT'), '/school/accounting');
    const res = mockRes();
    const next = jest.fn();
    await requirePermission(PERMISSIONS.ACCOUNTING_READ)(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('allows secretariat on bulletins write', async () => {
    resolveSchoolId.mockResolvedValueOnce(SCHOOL_ID);
    const req = mockReq(staffUser('SECRETARIAT'), '/school/bulletins/generate');
    const res = mockRes();
    const next = jest.fn();
    await requirePermission(PERMISSIONS.BULLETINS_WRITE)(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('blocks educator on accounting', async () => {
    resolveSchoolId.mockResolvedValueOnce(SCHOOL_ID);
    const req = mockReq(staffUser('EDUCATOR'), '/school/accounting');
    const res = mockRes();
    const next = jest.fn();
    await requirePermission(PERMISSIONS.ACCOUNTING_READ)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test('isSchoolPrimaryAdmin detects titular director', () => {
    expect(isSchoolPrimaryAdmin(schoolAdmin({ id: 'u-director' }), SCHOOL_ID)).toBe(true);
    expect(isSchoolPrimaryAdmin(staffUser('SECRETARIAT'), SCHOOL_ID)).toBe(false);
  });
});
