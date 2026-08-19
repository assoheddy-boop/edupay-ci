jest.mock('../src/config/database', () => ({
  school: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
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
    waveNumber: '07 11 22 33 44',
    students: [{ firstName: SECRET_PUPIL, lastName: 'Test', grades: [{ value: 18, subject: 'Maths' }] }],
    _count: { classes: 8 },
    admin: { email: SECRET_EMAIL },
    ...overrides,
  };
}

function csrfFrom(res) {
  const match = res.text.match(/name="_csrf" value="([^"]+)"/);
  return match ? match[1] : '';
}

describe('Public school portal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.school.findFirst.mockResolvedValue(null);
    prisma.school.findMany.mockResolvedValue([]);
  });

  test('GET /e/:slug returns 404 when the portal is disabled or missing', async () => {
    prisma.school.findFirst.mockResolvedValue(null);
    const res = await request(app).get(`/e/${SLUG}`);
    expect(res.status).toBe(404);
    expect(res.text).toMatch(/n’a pas publié|introuvable/i);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
  });

  test('GET /e/:slug returns 200 when enabled, with unique SEO and no grades', async () => {
    prisma.school.findFirst.mockResolvedValue(publishedSchool());
    const res = await request(app).get(`/e/${SLUG}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/IGEST/);
    expect(res.text).toMatch(/Yopougon-Sideci/);
    expect(res.text).toMatch(/Collège/);
    expect(res.text).toMatch(/rel="canonical"/);
    expect(res.text).toMatch(/\/e\/igest-yopougon-sideci/);
    expect(res.text).toMatch(/Payer la scolarité/);
    expect(res.text).toMatch(/href="\/auth\/login"/);
    expect(res.text).toMatch(/Espace parent \/ Connexion/);
    expect(res.text).toMatch(/openstreetmap\.org/);
    expect(res.text).not.toMatch(/maps\.google/i);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
    expect(res.text).not.toMatch(SECRET_EMAIL);
    expect(res.text).not.toMatch(/07 11 22 33 44/);
    expect(res.text).not.toMatch(/18\/20/);
    expect(res.text).toMatch(/ne sont pas publiés/);
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
  });

  test('lists only opted-in schools and supports ville + cycle search', async () => {
    prisma.school.findMany.mockResolvedValue([
      publishedSchool({ slug: 'igest-yopougon-sideci', city: 'Abidjan', educationCycle: 'COLLEGE' }),
    ]);
    const res = await request(app).get('/ecoles').query({ ville: 'Abidjan', cycle: 'COLLEGE' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Trouver une école/);
    expect(res.text).toMatch(/IGEST/);
    expect(res.text).toMatch(/href="\/e\/igest-yopougon-sideci"/);
    expect(res.text).not.toMatch(new RegExp(SECRET_PUPIL));
    expect(prisma.school.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        publicPortalEnabled: true,
        city: { contains: 'Abidjan', mode: 'insensitive' },
        educationCycle: 'COLLEGE',
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
      { slug: SLUG, updatedAt: new Date('2026-08-19') },
    ]);
  });

  test('sitemap.xml includes /ecoles and /e/:slug', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toMatch(/\/ecoles/);
    expect(res.text).toMatch(/\/e\/igest-yopougon-sideci/);
  });

  test('robots.txt points to the sitemap', async () => {
    const res = await request(app).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Sitemap: /);
    expect(res.text).toMatch(/sitemap\.xml/);
    expect(res.text).toMatch(/Disallow: \/school/);
  });
});
