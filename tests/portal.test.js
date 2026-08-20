jest.mock('../src/config/database', () => ({
  school: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  organization: {
    findFirst: jest.fn(),
  },
  portalPost: {
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  student: {
    findMany: jest.fn(),
  },
  subject: {
    findMany: jest.fn(),
  },
  schoolReview: {
    findMany: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('../src/services/email', () => ({
  sendEmail: jest.fn().mockResolvedValue({ ok: true }),
  smtpConfigured: jest.fn(() => false),
}));

const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const { sendEmail } = require('../src/services/email');

const SLUG = 'igest-yopougon-sideci';

const SECRET_PUPIL = 'AyaKouassiSecret';
const SECRET_EMAIL = 'secret-director@hidden.ci';
const SECRET_PARENT_PHONE = '0700998877';
const SECRET_MATRICULE = 'IG-DEMO-999';

function publishedSchool(overrides = {}) {
  return {
    id: 'sch_igest',
    name: 'IGEST',
    slug: SLUG,
    city: 'Abidjan',
    address: 'Yopougon-Sideci, Abidjan',
    campusLabel: 'Yopougon-Sideci',
    logoUrl: '/img/schools/igest-yopougon-sideci.png',
    logoBase64: null,
    educationCycle: 'COLLEGE',
    publicPortalEnabled: true,
    publicDescription: 'Collège partenaire EduConnect à Yopougon-Sideci.',
    publicPhone: '05 45 47 48 29',
    lat: 5.33,
    lng: -4.08,
    publicBanner: null,
    publicGallery: [],
    publicLife: 'Cantine et clubs : se renseigner au secrétariat.',
    publicFeatured: false,
    marketplaceTier: 'STANDARD',
    publicType: 'PRIVE',
    waveNumber: '07 11 22 33 44',
    students: [{
      firstName: SECRET_PUPIL,
      lastName: 'Test',
      matricule: SECRET_MATRICULE,
      grades: [{ value: 18, subject: 'Maths' }],
    }],
    _count: { classes: 8 },
    admin: { email: SECRET_EMAIL },
    ...overrides,
  };
}

function csrfFrom(res) {
  const match = res.text.match(/name="_csrf" value="([^"]+)"/);
  return match ? match[1] : '';
}

function mockEmptyPortalExtras() {
  prisma.portalPost.findMany.mockResolvedValue([]);
  prisma.student.findMany.mockResolvedValue([]);
  prisma.subject.findMany.mockResolvedValue([]);
  prisma.schoolReview.findMany.mockResolvedValue([]);
  prisma.schoolReview.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
}

describe('Public school portal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.school.findFirst.mockResolvedValue(null);
    prisma.school.findMany.mockResolvedValue([]);
    mockEmptyPortalExtras();
  });

  test('GET /e/:slug returns 404 when the portal is disabled or missing', async () => {
    prisma.school.findFirst.mockResolvedValue(null);
    const res = await request(app).get(`/e/${SLUG}`);
    expect(res.status).toBe(404);
    expect(res.text).toMatch(/n’a pas publié|introuvable/i);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
  });

  test('GET /e/:slug returns 404 when marketplace is off even if the slug exists', async () => {
    prisma.school.findFirst.mockResolvedValue(null);
    const res = await request(app).get(`/e/${SLUG}`);
    expect(res.status).toBe(404);
    expect(prisma.school.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        slug: SLUG,
        publicPortalEnabled: true,
        marketplaceTier: { in: ['STANDARD', 'PREMIUM', 'VIP'] },
        modules: { some: { moduleKey: 'marketplace', enabled: true } },
      }),
    }));
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
    expect(res.text).not.toMatch(/18\/20/);
  });

  test('GET /e/:slug returns 200 when enabled, with unique SEO and no grades', async () => {
    prisma.school.findFirst.mockResolvedValue(publishedSchool());
    const res = await request(app).get(`/e/${SLUG}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<title>[^<]*IGEST[^<]*Yopougon-Sideci[^<]*Côte d[’']Ivoire/);
    expect(res.text).toMatch(/<h1>[^<]*Institut Général d(?:['’]|&#39;)Enseignement Secondaire \(IGEST\)/);
    expect(res.text).toMatch(/IGEST/);
    expect(res.text).toMatch(/Yopougon-Sideci/);
    expect(res.text).toMatch(/Collège/);
    expect(res.text).toMatch(/name="robots" content="index, follow"/);
    expect(res.text).toMatch(/rel="canonical"/);
    expect(res.text).toMatch(/\/e\/igest-yopougon-sideci/);
    expect(res.text).toMatch(/og:title/);
    expect(res.text).toMatch(/"@type":\["EducationalOrganization","LocalBusiness","School"\]/);
    expect(res.text).toMatch(/"addressLocality":"Yopougon-Sideci"/);
    expect(res.text).toMatch(/"telephone":"05 45 47 48 29"/);
    expect(res.text).toMatch(/"latitude":5\.33/);
    expect(res.text).not.toMatch(/RCCM/i);
    expect(res.text).toMatch(/id="presentation"/);
    expect(res.text).toMatch(/id="cycles"/);
    expect(res.text).toMatch(/id="actualites"/);
    expect(res.text).toMatch(/id="galerie"/);
    expect(res.text).toMatch(/id="vie-scolaire"/);
    expect(res.text).toMatch(/id="resultats"/);
    expect(res.text).toMatch(/id="paiements"/);
    expect(res.text).toMatch(/id="contact"/);
    expect(res.text).toMatch(/Payer la scolarité/);
    expect(res.text).toMatch(/href="\/e\/igest-yopougon-sideci\/go\/payer"/);
    expect(res.text).toMatch(/href="\/e\/igest-yopougon-sideci\/go\/connexion"/);
    expect(res.text).toMatch(/Espace parent \/ Connexion/);
    expect(res.text).toMatch(/Paiements sécurisés via EduConnect/);
    expect(res.text).toMatch(/Wave/);
    expect(res.text).toMatch(/openstreetmap\.org/);
    expect(res.text).toMatch(/directions/);
    expect(res.text).toMatch(/wa\.me\/225/);
    expect(res.text).not.toMatch(/maps\.google/i);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
    expect(res.text).not.toMatch(SECRET_EMAIL);
    expect(res.text).not.toMatch(SECRET_MATRICULE);
    expect(res.text).not.toMatch(SECRET_PARENT_PHONE);
    expect(res.text).not.toMatch(/07 11 22 33 44/);
    expect(res.text).not.toMatch(/18\/20/);
    expect(res.text).toMatch(/ne sont pas publiés/);
    expect(res.text).toMatch(/Bulletins : espace parent/);
  });

  test('public HTML never leaks pupil names even when grades exist for aggregates', async () => {
    prisma.school.findFirst.mockResolvedValue(publishedSchool());
    prisma.student.findMany.mockResolvedValue([
      {
        id: 'st_secret',
        firstName: SECRET_PUPIL,
        lastName: 'Test',
        matricule: SECRET_MATRICULE,
        grades: [{
          subject: 'Maths',
          value: 12.4,
          maxValue: 20,
          period: 'T1',
          term: 'T1',
          kind: 'DEVOIR',
        }],
      },
    ]);
    const res = await request(app).get(`/e/${SLUG}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Taux de réussite/);
    expect(res.text).toMatch(/Moyenne générale/);
    expect(res.text).toMatch(/12,4\/20/);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
    expect(res.text).not.toMatch(SECRET_MATRICULE);
    expect(res.text).not.toMatch(SECRET_PARENT_PHONE);
    expect(prisma.student.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        id: true,
        grades: expect.anything(),
      }),
    }));
    const select = prisma.student.findMany.mock.calls[0][0].select;
    expect(select.firstName).toBeUndefined();
    expect(select.lastName).toBeUndefined();
    expect(select.matricule).toBeUndefined();
  });

  test('GET /:slug aliases to canonical /e/:slug without colliding with /devis', async () => {
    prisma.school.findFirst.mockResolvedValue(publishedSchool());
    const alias = await request(app).get(`/${SLUG}`);
    expect(alias.status).toBe(301);
    expect(alias.headers.location).toBe(`/e/${SLUG}`);

    const devis = await request(app).get('/devis');
    expect(devis.status).toBe(200);
    expect(devis.text).toMatch(/devis/i);
  });

  test('POST /e/:slug/contact is rate-limited path and does not leak grades', async () => {
    prisma.school.findFirst.mockResolvedValue(publishedSchool());
    const page = await request(app).get(`/e/${SLUG}`);
    const token = csrfFrom(page);
    const cookies = [].concat(page.headers['set-cookie'] || []).join('; ');
    const res = await request(app)
      .post(`/e/${SLUG}/contact`)
      .set('Cookie', cookies)
      .send({
        _csrf: token,
        name: 'Parent Test',
        email: 'parent@example.ci',
        phone: '0700000000',
        message: 'Bonjour, je souhaite des informations sur les inscriptions.',
      });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Message envoyé/);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
    expect(sendEmail).toHaveBeenCalled();
    const [to] = sendEmail.mock.calls[0];
    expect(to).toMatch(/contact@educonnect\.ci/);
  });
});

describe('Marketplace /ecoles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.school.findFirst.mockResolvedValue(null);
    prisma.school.findMany.mockResolvedValue([]);
    mockEmptyPortalExtras();
  });

  test('lists only opted-in schools and supports ville + cycle search', async () => {
    prisma.school.findMany.mockResolvedValue([
      publishedSchool({ slug: 'igest-yopougon-sideci', city: 'Abidjan', educationCycle: 'COLLEGE' }),
    ]);
    const res = await request(app).get('/ecoles').query({ ville: 'Abidjan', cycle: 'COLLEGE' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Collèges à Abidjan/);
    expect(res.text).toMatch(/<title>[^<]*Collèges à Abidjan[^<]*Côte d’Ivoire/);
    expect(res.text).toMatch(/name="robots" content="index, follow"/);
    expect(res.text).toMatch(/IGEST/);
    expect(res.text).toMatch(/href="\/e\/igest-yopougon-sideci"/);
    expect(res.text).toMatch(/href="\/ecoles\?cycle=COLLEGE"/);
    expect(res.text).toMatch(/href="\/ecoles\?cycle=LYCEE"/);
    expect(res.text).toMatch(/href="\/ecoles\/carte"/);
    expect(res.text).toMatch(/<select id="commune"/);
    expect(res.text).toMatch(/<select id="ville"/);
    expect(res.text).toMatch(/href="\/ecoles\?commune=Yopougon"/);
    expect(res.text).toMatch(/Yopougon-Sideci/);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
    expect(prisma.school.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        publicPortalEnabled: true,
        OR: expect.arrayContaining([
          { city: { contains: 'Abidjan', mode: 'insensitive' } },
          { campusLabel: { contains: 'Abidjan', mode: 'insensitive' } },
        ]),
        educationCycle: 'COLLEGE',
      }),
    }));
  });

  test('featured partner cards appear first', async () => {
    prisma.school.findMany.mockResolvedValue([
      publishedSchool({
        name: 'École Zèbre',
        slug: 'ecole-zebre',
        publicFeatured: false,
        marketplaceTier: 'STANDARD',
        students: [{ firstName: SECRET_PUPIL }],
      }),
      publishedSchool({
        name: 'École Alpha',
        slug: 'ecole-alpha',
        publicFeatured: true,
        marketplaceTier: 'PREMIUM',
        students: [{ firstName: SECRET_PUPIL }],
      }),
    ]);
    const res = await request(app).get('/ecoles');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<title>[^<]*Écoles en Côte d’Ivoire[^<]*collèges et lycées/);
    expect(res.text).toMatch(/"@type":"CollectionPage"/);
    expect(res.text.indexOf('École Alpha')).toBeGreaterThan(-1);
    expect(res.text.indexOf('École Alpha')).toBeLessThan(res.text.indexOf('École Zèbre'));
    expect(res.text).toMatch(/Premium/);
    expect(res.text).toMatch(/Partenaire/);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
  });

  test('VIP then premium appear before standard on /ecoles', async () => {
    prisma.school.findMany.mockResolvedValue([
      publishedSchool({
        name: 'École Standard',
        slug: 'ecole-standard',
        marketplaceTier: 'STANDARD',
        publicFeatured: false,
      }),
      publishedSchool({
        name: 'École Premium',
        slug: 'ecole-premium',
        marketplaceTier: 'PREMIUM',
        publicFeatured: true,
      }),
      publishedSchool({
        name: 'École VIP',
        slug: 'ecole-vip',
        marketplaceTier: 'VIP',
        publicFeatured: true,
      }),
    ]);
    const res = await request(app).get('/ecoles');
    expect(res.status).toBe(200);
    const vip = res.text.indexOf('École VIP');
    const premium = res.text.indexOf('École Premium');
    const standard = res.text.indexOf('École Standard');
    expect(vip).toBeGreaterThan(-1);
    expect(vip).toBeLessThan(premium);
    expect(premium).toBeLessThan(standard);
    expect(res.text).toMatch(/>VIP</);
    expect(res.text).toMatch(/>Premium</);
    expect(res.text).toMatch(/>Partenaire</);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
    expect(res.text).not.toMatch(/18\/20/);
  });

  test('ville query matches campus so Yopougon can list IGEST', async () => {
    prisma.school.findMany.mockResolvedValue([publishedSchool()]);
    const res = await request(app).get('/ecoles').query({ ville: 'Yopougon' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Écoles à Yopougon/);
    expect(res.text).toMatch(/href="\/e\/igest-yopougon-sideci"/);
    expect(prisma.school.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { campusLabel: { contains: 'Yopougon', mode: 'insensitive' } },
          { address: { contains: 'Yopougon', mode: 'insensitive' } },
        ]),
      }),
    }));
  });

  test('filters by establishment type', async () => {
    prisma.school.findMany.mockResolvedValue([publishedSchool({ publicType: 'PRIVE' })]);
    const res = await request(app).get('/ecoles').query({ type: 'PRIVE' });
    expect(res.status).toBe(200);
    expect(prisma.school.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        publicPortalEnabled: true,
        publicType: 'PRIVE',
      }),
    }));
  });

  test('filters by school name via q param', async () => {
    prisma.school.findMany.mockResolvedValue([
      publishedSchool({ name: 'IGEST Yopougon', slug: 'igest-yopougon-sideci' }),
    ]);
    const res = await request(app).get('/ecoles').query({ q: 'igest' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Résultats pour « igest »/);
    expect(res.text).toMatch(/IGEST/);
    expect(res.text).toMatch(/portal-school-grid/);
    expect(res.text).toMatch(/portal-school-card/);
    expect(res.text).toMatch(/1 établissement/);
    expect(res.text).toMatch(/name="q"[^>]*value="igest"/);
    expect(prisma.school.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        name: { contains: 'igest', mode: 'insensitive' },
      }),
    }));
  });

  test('q combines with ville and cycle filters', async () => {
    prisma.school.findMany.mockResolvedValue([publishedSchool()]);
    const res = await request(app).get('/ecoles').query({ q: 'IGEST', ville: 'Abidjan', cycle: 'COLLEGE' });
    expect(res.status).toBe(200);
    expect(prisma.school.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        name: { contains: 'IGEST', mode: 'insensitive' },
        educationCycle: 'COLLEGE',
        OR: expect.arrayContaining([
          { city: { contains: 'Abidjan', mode: 'insensitive' } },
        ]),
      }),
    }));
  });

  test('empty q search shows tailored empty state', async () => {
    prisma.school.findMany.mockResolvedValue([]);
    const res = await request(app).get('/ecoles').query({ q: 'InexistantXYZ' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Aucune école publiée pour « InexistantXYZ »/);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
  });

  test('GET /ecoles/verifies uses card grid and badges for Premium/VIP only', async () => {
    prisma.school.findMany.mockResolvedValue([
      publishedSchool({
        name: 'École Premium',
        slug: 'ecole-premium',
        marketplaceTier: 'PREMIUM',
      }),
    ]);
    const res = await request(app).get('/ecoles/verifies');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Établissements vérifiés EduConnect/);
    expect(res.text).toMatch(/portal-school-grid/);
    expect(res.text).toMatch(/portal-school-card/);
    expect(res.text).toMatch(/portal-featured-badge/);
    expect(res.text).toMatch(/Vérifié EduConnect/);
    expect(res.text).toMatch(/Premium/);
    expect(res.text).not.toMatch(/portal-school-link/);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
    expect(prisma.school.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        marketplaceTier: { in: ['PREMIUM', 'VIP'] },
      }),
    }));
  });

  test('GET /ecoles/verifies excludes Standard tier schools', async () => {
    prisma.school.findMany.mockResolvedValue([]);
    const res = await request(app).get('/ecoles/verifies');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/Partenaire EduConnect/);
    expect(prisma.school.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        marketplaceTier: { in: ['PREMIUM', 'VIP'] },
      }),
    }));
  });

  test('GET /ecoles paginates results and preserves filters in links', async () => {
    const many = Array.from({ length: 25 }, (_, i) => publishedSchool({
      name: `École ${String(i + 1).padStart(2, '0')}`,
      slug: `ecole-${i + 1}`,
      marketplaceTier: 'STANDARD',
    }));
    prisma.school.findMany.mockResolvedValue(many);
    const page1 = await request(app).get('/ecoles').query({ ville: 'Abidjan', page: 1 });
    expect(page1.status).toBe(200);
    expect(page1.text).toMatch(/25 établissements/);
    expect(page1.text).toMatch(/portal-pagination/);
    expect(page1.text).toMatch(/href="\/ecoles\?ville=Abidjan&amp;page=2"/);

    const page2 = await request(app).get('/ecoles').query({ ville: 'Abidjan', page: 2 });
    expect(page2.status).toBe(200);
    expect(page2.text).toMatch(/rel="prev"/);
    expect(page2.text).toMatch(/href="\/ecoles\?ville=Abidjan"/);
    expect(page2.text).toMatch(/canonical" href="[^"]+\/ecoles\?ville=Abidjan&amp;page=2"/);
  });

  test('GET /e/groupe/:slug renders card grid', async () => {
    prisma.organization.findFirst.mockResolvedValue({
      id: 'org_epv',
      name: 'EPV',
      slug: 'epv',
      city: 'Abidjan',
      publicPortalEnabled: true,
      publicDescription: 'Réseau EPV',
      publicPhone: null,
      logoUrl: null,
      logoBase64: null,
    });
    prisma.school.findMany.mockResolvedValue([
      publishedSchool({ name: 'EPV ECEME', slug: 'epv-eceme', marketplaceTier: 'PREMIUM' }),
    ]);
    const res = await request(app).get('/e/groupe/epv');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/portal-school-grid/);
    expect(res.text).toMatch(/portal-school-card/);
    expect(res.text).toMatch(/EPV ECEME/);
    expect(res.text).not.toMatch(/portal-school-link/);
  });

  test('empty marketplace does not invent pupil results', async () => {
    prisma.school.findMany.mockResolvedValue([]);
    const res = await request(app).get('/ecoles').query({ ville: 'Korhogo' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Aucune école publiée/);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
    expect(res.text).not.toMatch(/18\/20/);
  });

  test('GET /ecoles/carte renders Leaflet map with school markers', async () => {
    prisma.school.findMany.mockResolvedValue([
      publishedSchool({
        name: 'IGEST Carte',
        slug: 'igest-yopougon-sideci',
        commune: 'Yopougon',
        lat: 5.33,
        lng: -4.08,
      }),
    ]);
    const res = await request(app).get('/ecoles/carte');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Carte des écoles/);
    expect(res.text).toMatch(/leaflet/);
    expect(res.text).toMatch(/openstreetmap\.org/);
    expect(res.text).toMatch(/portal-school-map/);
    expect(res.text).toMatch(/IGEST Carte/);
    expect(res.text).toMatch(/\/e\/igest-yopougon-sideci/);
    expect(res.text).toMatch(/var center = \{"lat":5\.3364,"lng":-4\.0267,"zoom":11\}/);
    expect(res.text).not.toMatch(/&#34;lat&#34;/);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
  });
});

describe('listPublishedSchools pagination', () => {
  const { listPublishedSchools, MARKETPLACE_PAGE_SIZE } = require('../src/services/marketplace');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('paginates sorted schools with default page size', async () => {
    const rows = Array.from({ length: MARKETPLACE_PAGE_SIZE + 3 }, (_, i) => ({
      id: `sch_${i}`,
      name: `École ${i}`,
      slug: `ecole-${i}`,
      city: 'Abidjan',
      educationCycle: 'COLLEGE',
      marketplaceTier: 'STANDARD',
      publicFeatured: false,
    }));
    prisma.school.findMany.mockResolvedValue(rows);
    const page1 = await listPublishedSchools({ page: 1 });
    expect(page1.total).toBe(MARKETPLACE_PAGE_SIZE + 3);
    expect(page1.schools).toHaveLength(MARKETPLACE_PAGE_SIZE);
    expect(page1.totalPages).toBe(2);
    const page2 = await listPublishedSchools({ page: 2 });
    expect(page2.schools).toHaveLength(3);
  });

  test('verifiedOnly restricts to Premium and VIP', async () => {
    prisma.school.findMany.mockResolvedValue([]);
    await listPublishedSchools({ verifiedOnly: true });
    expect(prisma.school.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        marketplaceTier: { in: ['PREMIUM', 'VIP'] },
      }),
    }));
  });
});

describe('SEO sitemap and robots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.school.findMany.mockResolvedValue([
      { slug: SLUG, updatedAt: new Date('2026-08-19'), marketplaceTier: 'VIP' },
    ]);
    mockEmptyPortalExtras();
  });

  test('sitemap.xml includes public pages and /e/:slug', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toMatch(/<urlset /);
    expect(res.text).toMatch(/<loc>https?:\/\/[^<]+\/ecoles<\/loc>/);
    expect(res.text).toMatch(/<loc>https?:\/\/[^<]+\/ecoles\/carte<\/loc>/);
    expect(res.text).toMatch(/<loc>https?:\/\/[^<]+\/e\/igest-yopougon-sideci<\/loc>/);
    expect(res.text).toMatch(/<loc>https?:\/\/[^<]+\/mentions-legales<\/loc>/);
    expect(res.text).toMatch(/<loc>https?:\/\/[^<]+\/confidentialite<\/loc>/);
    expect(res.text).toMatch(/<loc>https?:\/\/[^<]+\/devis<\/loc>/);
    expect(res.text).toMatch(/<loc>https?:\/\/[^<]+\/guides<\/loc>/);
    expect(res.text).not.toMatch(/\/auth/);
    expect(res.text).not.toMatch(/\/admin/);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
  });

  test('sitemap.xml stays valid XML when Prisma fails or lastmod is invalid', async () => {
    prisma.school.findMany.mockRejectedValue(new Error('column School.updatedAt does not exist'));
    const failed = await request(app).get('/sitemap.xml');
    expect(failed.status).toBe(200);
    expect(failed.headers['content-type']).toMatch(/xml/);
    expect(failed.text).toMatch(/<urlset /);
    expect(failed.text).toMatch(/\/ecoles/);
    expect(failed.text).not.toMatch(/Erreur serveur/);

    prisma.school.findMany.mockResolvedValue([
      { slug: SLUG, updatedAt: new Date('not-a-date'), marketplaceTier: 'STANDARD' },
    ]);
    const invalid = await request(app).get('/sitemap.xml');
    expect(invalid.status).toBe(200);
    expect(invalid.text).toMatch(/\/e\/igest-yopougon-sideci/);
    expect(invalid.text).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  test('sitemap.xml omits marketplace-off schools', async () => {
    prisma.school.findMany.mockResolvedValue([
      { slug: 'ecole-privee-cachee', updatedAt: new Date('2026-08-19'), marketplaceTier: 'NONE' },
      { slug: SLUG, updatedAt: new Date('2026-08-19'), marketplaceTier: 'VIP' },
    ]);
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/\/e\/igest-yopougon-sideci/);
    expect(res.text).not.toMatch(/ecole-privee-cachee/);
  });

  test('robots.txt points to the sitemap', async () => {
    const res = await request(app).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Sitemap: /);
    expect(res.text).toMatch(/sitemap\.xml/);
    expect(res.text).toMatch(/Disallow: \/school/);
    expect(res.text).toMatch(/Disallow: \/auth/);
  });

  test('auth and private areas are noindex; public school pages are indexable', async () => {
    prisma.school.findFirst.mockResolvedValue(publishedSchool());
    const school = await request(app).get(`/e/${SLUG}`);
    expect(school.status).toBe(200);
    expect(school.text).toMatch(/name="robots" content="index, follow"/);
    expect(school.headers['x-robots-tag']).toMatch(/index,\s*follow/i);

    const market = await request(app).get('/ecoles');
    expect(market.status).toBe(200);
    expect(market.text).toMatch(/name="robots" content="index, follow"/);

    const login = await request(app).get('/auth/login');
    expect(login.status).toBe(200);
    expect(login.text).toMatch(/name="robots" content="noindex, nofollow"/);
    expect(login.headers['x-robots-tag']).toMatch(/noindex/i);
  });
});

describe('Marketplace reviews and compare', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.school.findFirst.mockResolvedValue(null);
    prisma.school.findMany.mockResolvedValue([]);
    mockEmptyPortalExtras();
  });

  test('GET /e/:slug shows review form and approved reviews', async () => {
    prisma.school.findFirst.mockResolvedValue(publishedSchool());
    prisma.schoolReview.findMany.mockResolvedValue([{
      id: 'rev1',
      authorName: 'Awa',
      rating: 5,
      comment: 'Très bon accueil et suivi pédagogique.',
      createdAt: new Date('2026-08-01'),
    }]);
    prisma.schoolReview.aggregate.mockResolvedValue({ _avg: { rating: 5 }, _count: { _all: 1 } });
    const res = await request(app).get(`/e/${SLUG}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Avis des parents/);
    expect(res.text).toMatch(/5\/5/);
    expect(res.text).toMatch(/Très bon accueil/);
    expect(res.text).toMatch(/name="authorName"/);
  });

  test('POST /e/:slug/avis creates pending review with CSRF', async () => {
    prisma.school.findFirst.mockResolvedValue(publishedSchool());
    prisma.schoolReview.create.mockResolvedValue({ id: 'rev_new' });
    const page = await request(app).get(`/e/${SLUG}`);
    const token = csrfFrom(page);
    const cookies = [].concat(page.headers['set-cookie'] || []).join('; ');
    const res = await request(app)
      .post(`/e/${SLUG}/avis`)
      .set('Cookie', cookies)
      .send({
        _csrf: token,
        authorName: 'Kofi',
        rating: '4',
        comment: 'Bonne école, communication claire avec les parents.',
      });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/modération/);
    expect(prisma.schoolReview.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        authorName: 'Kofi',
        rating: 4,
        status: 'PENDING',
      }),
    }));
  });

  test('GET /ecoles/comparer requires at least 2 schools', async () => {
    const res = await request(app).get('/ecoles/comparer?slugs=igest-yopougon-sideci');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/au moins 2 écoles/i);
  });

  test('GET /ecoles/comparer renders side-by-side table', async () => {
    const other = publishedSchool({
      id: 'sch_other',
      name: 'Lycée Moderne',
      slug: 'lycee-moderne',
    });
    prisma.school.findMany.mockResolvedValue([publishedSchool(), other]);
    const res = await request(app).get('/ecoles/comparer?slugs=igest-yopougon-sideci,lycee-moderne');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/portal-compare-table/);
    expect(res.text).toMatch(/IGEST/);
    expect(res.text).toMatch(/Lycée Moderne/);
  });

  test('GET /ecoles includes compare button and marketplace manifest', async () => {
    prisma.school.findMany.mockResolvedValue([publishedSchool()]);
    const res = await request(app).get('/ecoles');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/portal-compare-add/);
    expect(res.text).toMatch(/manifest-marketplace\.json/);
    expect(res.text).toMatch(/Comparer des écoles/);
  });

  test('GET /ecoles/comparer/add sets compare cookie', async () => {
    prisma.school.findFirst.mockResolvedValue(publishedSchool());
    const res = await request(app).get(`/ecoles/comparer/add?slug=${SLUG}`);
    expect(res.status).toBe(302);
    expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringMatching(/ec_compare=igest-yopougon-sideci/),
    ]));
  });
});
