const {
  ENROLLMENT_DOCUMENTS,
  parseDocumentsChecklist,
  mergeChecklist,
  emptyChecklist,
} = require('../src/utils/enrollmentForm');

describe('enrollmentForm utils', () => {
  test('ENROLLMENT_DOCUMENTS includes CI checklist items', () => {
    const keys = ENROLLMENT_DOCUMENTS.map((d) => d.key);
    expect(keys).toContain('photos');
    expect(keys).toContain('extraitNaissance');
    expect(keys).toContain('visiteMedicale');
    expect(keys.length).toBeGreaterThanOrEqual(10);
  });

  test('parseDocumentsChecklist reads doc_* fields', () => {
    const body = { doc_photos: 'on', doc_extraitNaissance: 'on' };
    const checklist = parseDocumentsChecklist(body);
    expect(checklist.photos).toBe(true);
    expect(checklist.extraitNaissance).toBe(true);
    expect(checklist.teeShirt).toBe(false);
  });

  test('mergeChecklist merges stored json', () => {
    const merged = mergeChecklist({ photos: true, carnetCorrespondance: true });
    expect(merged.photos).toBe(true);
    expect(merged.carnetCorrespondance).toBe(true);
    expect(merged.short).toBe(false);
    expect(Object.keys(emptyChecklist()).length).toBe(ENROLLMENT_DOCUMENTS.length);
  });
});

describe('enrollment routes registered', () => {
  test('school router exposes inscription paths', () => {
    const router = require('../src/routes/school');
    const paths = router.stack
      .filter((layer) => layer.route)
      .map((layer) => {
        const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
        return `${methods} ${layer.route.path}`;
      });
    expect(paths.some((p) => p.includes('/inscriptions'))).toBe(true);
    expect(paths.some((p) => p.includes('/inscriptions/nouvelle'))).toBe(true);
  });
});
