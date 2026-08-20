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
    expect(paths.some((p) => p.includes('/inscriptions/recherche'))).toBe(true);
    expect(paths.some((p) => p.includes('/inscriptions/:studentId/fiche.pdf'))).toBe(true);
    expect(paths.some((p) => p.includes('certificat-scolarite.pdf'))).toBe(true);
  });
});

describe('enrollment PDF services', () => {
  test('generateEnrollmentFichePdf returns buffer and filename', async () => {
    const { generateEnrollmentFichePdf } = require('../src/services/enrollmentPdf');
    const result = await generateEnrollmentFichePdf({
      school: { name: 'Lycée Test', city: 'Abidjan', address: 'Plateau' },
      schoolYear: '2025-2026',
      student: {
        id: 'stu1',
        firstName: 'Aya',
        lastName: 'Kouassi',
        matricule: 'IG-001',
        nationalMatricule: 'MEN123',
        birthDate: new Date('2010-05-12'),
        birthPlace: 'Abidjan',
        gender: 'F',
        nationality: 'Ivoirienne',
        class: { name: '6ème A', series: null },
        series: null,
      },
      enrollment: {
        enrollmentStatus: 'NOUVEAU',
        lv2: 'Espagnol',
        birthCertNumber: '123',
        enrolledAt: new Date('2025-09-01'),
        isScholarship: false,
      },
      yearRecord: { repeatYear: false },
      classStats: { male: 12, female: 14, total: 26 },
      documents: { photos: true, extraitNaissance: true },
    });
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(500);
    expect(result.filename).toContain('fiche-inscription');
  });

  test('generateCertificatScolaritePdf returns buffer', async () => {
    const { generateCertificatScolaritePdf } = require('../src/services/certificatePdf');
    const result = await generateCertificatScolaritePdf({
      school: { name: 'Lycée Test', city: 'Abidjan' },
      schoolYear: '2025-2026',
      student: {
        id: 'stu1',
        firstName: 'Aya',
        lastName: 'Kouassi',
        nationalMatricule: 'MEN123',
        matricule: 'IG-001',
        birthDate: new Date('2010-05-12'),
        birthPlace: 'Abidjan',
        gender: 'F',
        class: { name: '6ème A' },
      },
    });
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.filename).toContain('certificat-scolarite');
  });
});
