const { studentWhereForUser, classWhereForUser } = require('../src/controllers/apiController');
const { fileFromSyncPayload } = require('../src/services/offlineActions');
const { safeInternalPath } = require('../src/utils/cookies');

describe('teacher API roster scope', () => {
  test('teachers only query students in their classes', () => {
    const where = studentWhereForUser({
      role: 'TEACHER',
      teacher: { id: 't1', schoolId: 'sch-1' },
    });
    expect(where).toEqual({
      schoolId: 'sch-1',
      class: { teachers: { some: { teacherId: 't1' } } },
    });
  });

  test('school admins still query the whole school', () => {
    expect(studentWhereForUser({
      role: 'SCHOOL_ADMIN',
      school: { id: 'sch-1' },
    })).toEqual({ schoolId: 'sch-1' });
    expect(classWhereForUser({
      role: 'SCHOOL_ADMIN',
      school: { id: 'sch-1' },
    })).toEqual({ schoolId: 'sch-1' });
  });
});

describe('sync payload files', () => {
  test('drops SVG payloads', () => {
    const svg = Buffer.from('<svg onload="alert(1)"></svg>').toString('base64');
    expect(fileFromSyncPayload({
      data: svg,
      name: 'x.svg',
      type: 'image/svg+xml',
    })).toBeNull();
  });

  test('keeps a jpeg proof', () => {
    const file = fileFromSyncPayload({
      data: Buffer.from([0xff, 0xd8, 0xff]).toString('base64'),
      name: 'proof.jpg',
      type: 'image/jpeg',
    });
    expect(file).toBeTruthy();
    expect(file.originalname).toBe('proof.jpg');
  });
});

describe('admin redirect allowlist', () => {
  test('rejects off-site redirect bodies', () => {
    expect(safeInternalPath('https://evil.com', '/admin/dashboard')).toBe('/admin/dashboard');
    expect(safeInternalPath('//evil.com', '/admin/dashboard')).toBe('/admin/dashboard');
    expect(safeInternalPath('/admin/schools/abc/modules', '/x')).toBe('/admin/schools/abc/modules');
  });
});
