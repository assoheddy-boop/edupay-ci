jest.mock('../src/config/database', () => ({
  school: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
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
    expect(res.text).toMatch(/"@type":\["School","EducationalOrganization"\]/);
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
    expect(res.text).toMatch(/href="\/auth\/login"/);
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
    expect(res.text).toMatch(/href="\/ecoles\?ville=Yopougon"/);
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

  test('empty marketplace does not invent pupil results', async () => {
    prisma.school.findMany.mockResolvedValue([]);
    const res = await request(app).get('/ecoles').query({ ville: 'Korhogo' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Aucune école publiée/);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
    expect(res.text).not.toMatch(/18\/20/);
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
