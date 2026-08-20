jest.mock('../src/config/database', () => ({
  quoteRequest: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('../src/services/email', () => ({
  sendEmail: jest.fn(),
  smtpConfigured: jest.fn(() => false),
}));

const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const { sendEmail, smtpConfigured } = require('../src/services/email');
const { COMMERCIAL_PLAN } = require('../src/config/plans');
const { parseQuoteBody, quoteSummary } = require('../src/utils/quoteAnswers');
const { MARKETPLACE_OFFER_OPTIONS } = require('../src/config/marketplaceOffers');

const QUOTE_ID = 'clquotepro000000000000001';

function sampleQuote(overrides = {}) {
  return {
    id: QUOTE_ID,
    status: 'pending',
    schoolName: 'Groupe Scolaire Les Palmiers',
    city: 'Abidjan',
    amount: 500000,
    contactName: 'Awa Koné',
    contactEmail: 'awa@ecole.ci',
    contactPhone: '0700000000',
    activationRequestedAt: null,
    createdAt: new Date('2026-08-18T10:00:00.000Z'),
    answers: {
      schoolName: 'Groupe Scolaire Les Palmiers',
      city: 'Abidjan',
      isGroup: false,
      groupName: '',
      students: 420,
      teachers: 28,
      classes: 16,
      life: { canteen: true, transport: false, activities: true, health: false },
      admin: { accounting: true, hr: true, multiSchool: false },
      comm: { smsOfficial: true, pushEmail: true },
      history: { year1: 380, year2: 400, year3: 410, digitalBudget: '2 000 000' },
      contact: { name: 'Awa Koné', email: 'awa@ecole.ci', phone: '0700000000' },
    },
    ...overrides,
  };
}

function csrfFrom(res) {
  const match = res.text.match(/name="_csrf" value="([^"]+)"/);
  return match ? match[1] : '';
}

describe('Public devis questionnaire', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    smtpConfigured.mockReturnValue(false);
  });

  test('GET /devis is public and names the Pro plan', async () => {
    const res = await request(app).get('/devis');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/devis Pro/i);
    expect(res.text).not.toMatch(/500\s*000/);
    expect(res.text).toMatch(/name="_csrf"/);
    expect(res.text).toMatch(/Établissement/);
    expect(res.text).toMatch(/Visibilité web/i);
    expect(res.text).toMatch(/portail EduConnect/i);
    expect(res.text).not.toMatch(/Choisir Premium/);
    expect(res.text).not.toMatch(/Essentiel/);
    expect(res.headers['set-cookie']?.join(';')).toMatch(/edu_csrf=|devis_csrf=/);
  });

  test('POST /devis creates a quote at 500000 FCFA without marketplace', async () => {
    const page = await request(app).get('/devis');
    const token = csrfFrom(page);
    prisma.quoteRequest.create.mockResolvedValue(sampleQuote());

    const res = await request(app)
      .post('/devis')
      .set('Cookie', page.headers['set-cookie'])
      .type('form')
      .send({
        _csrf: token,
        schoolName: 'Groupe Scolaire Les Palmiers',
        city: 'Abidjan',
        isGroup: 'non',
        students: '420',
        teachers: '28',
        classes: '16',
        lifeCanteen: 'on',
        adminAccounting: 'on',
        commSms: 'on',
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/devis/${QUOTE_ID}`);
    expect(prisma.quoteRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        amount: COMMERCIAL_PLAN.amount,
        schoolName: 'Groupe Scolaire Les Palmiers',
        city: 'Abidjan',
        status: 'pending',
      }),
    }));
    expect(prisma.quoteRequest.create.mock.calls[0][0].data.amount).toBe(500000);
    expect(prisma.quoteRequest.create.mock.calls[0][0].data.marketplaceAmount).toBe(0);
  });

  test('POST /devis adds marketplace line when Premium selected', async () => {
    const page = await request(app).get('/devis');
    const token = csrfFrom(page);
    prisma.quoteRequest.create.mockResolvedValue(sampleQuote({
      marketplaceAmount: 150000,
      answers: {
        ...sampleQuote().answers,
        marketplace: { selected: true, tier: 'PREMIUM', label: 'Premium', amount: 150000 },
      },
    }));

    const res = await request(app)
      .post('/devis')
      .set('Cookie', page.headers['set-cookie'])
      .type('form')
      .send({
        _csrf: token,
        schoolName: 'Groupe Scolaire Les Palmiers',
        city: 'Abidjan',
        isGroup: 'non',
        students: '420',
        teachers: '28',
        classes: '16',
        marketplaceTier: 'PREMIUM',
      });

    expect(res.status).toBe(302);
    expect(prisma.quoteRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        amount: 500000,
        marketplaceAmount: 150000,
      }),
    }));
  });

  test('quoteSummary totals Pro and Marketplace', () => {
    const parsed = parseQuoteBody({
      schoolName: 'Test',
      city: 'Abidjan',
      students: '100',
      teachers: '10',
      classes: '5',
      marketplaceTier: 'VIP',
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.marketplaceAmount).toBe(300000);
    expect(parsed.totalAmount).toBe(COMMERCIAL_PLAN.amount + 300000);
    const summary = quoteSummary(parsed.answers);
    expect(summary.totalAmount).toBe(COMMERCIAL_PLAN.amount + 300000);
    expect(MARKETPLACE_OFFER_OPTIONS.some((o) => o.value === 'VIP' && o.amount === 300000)).toBe(true);
  });

  test('GET /devis/:id/pdf returns a PDF', async () => {
    prisma.quoteRequest.findUnique.mockResolvedValue(sampleQuote());
    const res = await request(app).get(`/devis/${QUOTE_ID}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/i);
    expect(res.body.length).toBeGreaterThan(400);
    expect(res.body.toString('utf8', 0, 5)).toBe('%PDF-');
  });

  test('POST /devis/:id/activer succeeds without SMTP', async () => {
    const page = await request(app).get('/devis');
    const token = csrfFrom(page);
    prisma.quoteRequest.findUnique.mockResolvedValue(sampleQuote());
    prisma.quoteRequest.update.mockResolvedValue(sampleQuote({
      status: 'activation_requested',
      activationRequestedAt: new Date(),
    }));

    const res = await request(app)
      .post(`/devis/${QUOTE_ID}/activer`)
      .set('Cookie', page.headers['set-cookie'])
      .type('form')
      .send({ _csrf: token });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/demande enregistrée, nous vous contactons/i);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.quoteRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: QUOTE_ID },
      data: expect.objectContaining({ status: 'activation_requested' }),
    }));
  });

  test('GET /devis/:id shows the Pro amount', async () => {
    prisma.quoteRequest.findUnique.mockResolvedValue(sampleQuote());
    const res = await request(app).get(`/devis/${QUOTE_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/500\s*000/);
    expect(res.text).toMatch(/devis-offer-price/);
  });

  test('home HTML links to /devis without publishing the Pro price', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/href="\/devis"/);
    expect(res.text).toMatch(/Obtenir un devis/i);
    expect(res.text).toMatch(/>Devis</);
    expect(res.text).not.toMatch(/500\s*000/);
    expect(res.text).not.toMatch(/Offre Pro/);
    expect(res.text).not.toMatch(/Voir l'offre/);
    expect(res.text).not.toMatch(/id="tarifs"/);
    expect(res.text).not.toMatch(/href="#tarifs"/);
    expect(res.text).not.toMatch(/href="#offre"/);
    expect(res.text).not.toMatch(/Choisir Premium/);
    expect(res.text).not.toMatch(/Essentiel/);
    expect(res.text).not.toMatch(/plan Standard/i);
  });
});
