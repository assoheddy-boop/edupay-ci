jest.mock('../src/config/database', () => ({
  school: { findUnique: jest.fn() },
}));

const prisma = require('../src/config/database');
const { resolveSchoolId } = require('../src/middleware/modules');
const { resolveActiveSchoolId, resolveActiveSchool } = require('../src/utils/schoolContext');

const SCHOOL_A = 'sch-a';
const SCHOOL_B = 'sch-b';

function multiStaffUser() {
  return {
    id: 'u-multi',
    role: 'SCHOOL_ADMIN',
    school: { id: SCHOOL_A, name: 'Campus A' },
    staffAssignments: [
      { schoolId: SCHOOL_A, school: { id: SCHOOL_A, name: 'Campus A' } },
      { schoolId: SCHOOL_B, school: { id: SCHOOL_B, name: 'Campus B' } },
    ],
  };
}

describe('resolveSchoolId multi-campus', () => {
  test('prefers selectedSchoolId cookie over user.school for multi-assignment staff', async () => {
    const user = multiStaffUser();
    const req = { cookies: { selectedSchoolId: SCHOOL_B } };
    await expect(resolveSchoolId(user, req)).resolves.toBe(SCHOOL_B);
  });

  test('falls back to first assignment when no cookie', async () => {
    const user = multiStaffUser();
    await expect(resolveSchoolId(user, {})).resolves.toBe(SCHOOL_A);
  });
});

describe('resolveActiveSchoolId', () => {
  test('returns null without user on req', async () => {
    await expect(resolveActiveSchoolId({})).resolves.toBeNull();
  });

  test('delegates to resolveSchoolId with req.user', async () => {
    const user = multiStaffUser();
    const req = { user, cookies: { selectedSchoolId: SCHOOL_B } };
    await expect(resolveActiveSchoolId(req)).resolves.toBe(SCHOOL_B);
  });
});

describe('resolveActiveSchool', () => {
  test('returns matching staff assignment school without db hit', async () => {
    const user = multiStaffUser();
    const req = { user, cookies: { selectedSchoolId: SCHOOL_B } };
    const school = await resolveActiveSchool(req);
    expect(school).toEqual({ id: SCHOOL_B, name: 'Campus B' });
    expect(prisma.school.findUnique).not.toHaveBeenCalled();
  });
});
