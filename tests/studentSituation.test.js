const { loadStudentSituation } = require('../src/services/studentSituationService');
const { PERMISSIONS } = require('../src/utils/staffPermissions');

describe('student situation', () => {
  test('school router exposes GET /students/:id', () => {
    const router = require('../src/routes/school');
    const paths = router.stack
      .filter((layer) => layer.route)
      .map((layer) => {
        const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
        return `${methods} ${layer.route.path}`;
      });
    expect(paths.some((p) => p.includes('GET /students/:id'))).toBe(true);
  });

  test('loadStudentSituation returns null for unknown student', async () => {
    const result = await loadStudentSituation({
      schoolId: 'nonexistent-school',
      schoolYear: '2025-2026',
      studentId: 'nonexistent-student',
      permissions: Object.values(PERMISSIONS),
    });
    expect(result).toBeNull();
  });
});
