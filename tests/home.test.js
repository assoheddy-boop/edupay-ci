jest.mock('../src/config/database', () => ({
  school: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  quoteRequest: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}));

const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const { listFeaturedSchools } = require('../src/services/marketplace');

const SECRET_PUPIL = 'AyaKouassiSecretHome';

function publishedSchool(overrides = {}) {
  return {
    id: 'sch_igest',
    name: 'IGEST',
    slug: 'igest-yopougon-sideci',
    city: 'Abidjan',
    address: 'Yopougon-Sideci, Abidjan',
    campusLabel: 'Yopougon-Sideci',
    logoUrl: '/img/schools/igest-yopougon-sideci.png',
    logoBase64: null,
    educationCycle: 'COLLEGE',
    publicPortalEnabled: true,
    publicDescription: 'Collège partenaire EduConnect à Yopougon-Sideci.',
    publicPhone: '05 45 47 48 29',
    publicFeatured: false,
    publicType: 'PRIVE',
    lat: 5.33,
    lng: -4.08,
    students: [{ firstName: SECRET_PUPIL, lastName: 'Test', grades: [{ value: 18 }] }],
    ...overrides,
  };
}

describe('Homepage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.school.findMany.mockResolvedValue([
      publishedSchool(),
      publishedSchool({
        id: 'sch_bonne_main',
        name: 'EPV La Bonne Main de Dieu',
        slug: 'epv-la-bonne-main-de-dieu',
        logoUrl: '/img/schools/epv-la-bonne-main-de-dieu.png',
        campusLabel: 'Yopougon Académie',
      }),
    ]);
  });

  test('GET / returns 200 with slogan, /ecoles, and no Pro price', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/EduConnect — Gestion scolaire et visibilité digitale des écoles/);
    expect(res.text).toMatch(/href="\/ecoles"/);
    expect(res.text).toMatch(/action="\/ecoles"/);
    expect(res.text).toMatch(/name="ville"/);
    expect(res.text).toMatch(/name="cycle"/);
    expect(res.text).toMatch(/Inscrire mon établissement/);
    expect(res.text).toMatch(/Connexion espace parent/);
    expect(res.text).toMatch(/href="\/auth\/login"/);
    expect(res.text).toMatch(/href="\/devis"/);
    expect(res.text).toMatch(/id="homeNavToggle"/);
    expect(res.text).toMatch(/id="homeNav"/);
    expect(res.text).toMatch(/\/img\/home-hero\.jpg/);
    expect(res.text).toMatch(/Vos données élèves sont protégées/);
    expect(res.text).toMatch(/Paiements sécurisés via Wave/);
    expect(res.text).toMatch(/Les directions suivent paiements et absences depuis le téléphone/);
    expect(res.text).not.toMatch(/500\s*000/);
    expect(res.text).not.toMatch(SECRET_PUPIL);
    expect(res.text).not.toMatch(/EduPay/i);
  });

  test('GET / includes compact pricing summary with link to /tarifs', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/id="tarifs"/);
    expect(res.text).toMatch(/Tarification transparente/);
    expect(res.text).toMatch(/50(?:\s|&nbsp;)*000 FCFA/);
    expect(res.text).toMatch(/80(?:\s|&nbsp;)*000 FCFA/);
    expect(res.text).toMatch(/2(?:\s|&nbsp;)*500 FCFA/);
    expect(res.text).toMatch(/convention signée/i);
    expect(res.text).toMatch(/Voir tous les tarifs/);
    expect(res.text).toMatch(/href="\/tarifs"/);
  });

  test('GET / has unique SEO and Open Graph tags', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<title>Gestion scolaire et écoles en Côte d’Ivoire — EduConnect<\/title>/);
    expect(res.text).toMatch(/name="robots" content="index, follow"/);
    expect(res.text).toMatch(/href="\/ecoles"/);
    expect(res.text).toMatch(/meta name="description"/);
    expect(res.text).toMatch(/property="og:title"/);
    expect(res.text).toMatch(/property="og:image"/);
    expect(res.text).toMatch(/rel="canonical"/);
  });

  test('GET / shows featured published schools without pupil data', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/IGEST/);
    expect(res.text).toMatch(/href="\/e\/igest-yopougon-sideci"/);
    expect(res.text).toMatch(/Voir toutes les écoles/);
    expect(res.text).not.toMatch(/matricule/i);
    expect(res.text).not.toMatch(SECRET_PUPIL);
  });

  test('listFeaturedSchools prefers publicFeatured then IGEST', async () => {
    const featured = publishedSchool({
      id: 'sch_feat',
      name: 'École Mise en avant',
      slug: 'ecole-mise-en-avant',
      publicFeatured: true,
    });
    const igest = publishedSchool();
    const other = publishedSchool({
      id: 'sch_other',
      name: 'Autre Collège',
      slug: 'autre-college',
    });
    prisma.school.findMany.mockImplementation(async ({ where } = {}) => {
      if (where?.publicFeatured) return [featured];
      return [other, igest];
    });

    const cards = await listFeaturedSchools(3);
    expect(cards.map((c) => c.slug)).toEqual([
      'ecole-mise-en-avant',
      'igest-yopougon-sideci',
      'autre-college',
    ]);
    expect(cards.every((c) => !c.students)).toBe(true);
  });

  test('listFeaturedSchools falls back to IGEST when publicFeatured is unavailable', async () => {
    prisma.school.findMany
      .mockRejectedValueOnce(new Error('Unknown argument publicFeatured'))
      .mockResolvedValueOnce([
        publishedSchool({
          id: 'sch_other',
          name: 'Autre Collège',
          slug: 'autre-college',
        }),
        publishedSchool(),
      ]);

    const cards = await listFeaturedSchools(3);
    expect(cards[0].slug).toBe('igest-yopougon-sideci');
    expect(cards.some((c) => c.slug === 'autre-college')).toBe(true);
  });
});
