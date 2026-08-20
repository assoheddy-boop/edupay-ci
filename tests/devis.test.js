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
const { parseQuoteBody, quoteSummary } = require('../src/utils/quoteAnswers');
const { MARKETPLACE_OFFER_OPTIONS } = require('../src/config/marketplaceOffers');
const { quoteAmountForCycle } = require('../src/config/tarification');

const QUOTE_ID = 'clquotepro000000000000001';

function sampleQuote(overrides = {}) {
  return {
    id: QUOTE_ID,
    status: 'pending',
    schoolName: 'Groupe Scolaire Les Palmiers',
    city: 'Abidjan',
    amount: 50000,
    contactName: 'Awa Koné',
    contactEmail: 'awa@ecole.ci',
    contactPhone: '0700000000',
    activationRequestedAt: null,
    createdAt: new Date('2026-08-18T10:00:00.000Z'),
    answers: {
      cycleType: 'PRIMAIRE',
      cycleLabel: 'Primaire',
      conventionOnly: false,
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

function baseFormFields(token, extra = {}) {
  return {
    _csrf: token,
    cycleType: 'PRIMAIRE',
    schoolName: 'Groupe Scolaire Les Palmiers',
    city: 'Abidjan',
    isGroup: 'non',
    students: '420',
    teachers: '28',
    classes: '16',
    ...extra,
  };
}

describe('Public devis questionnaire', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    smtpConfigured.mockReturnValue(false);
  });

  test('GET /devis is public and shows cycle selection', async () => {
    const res = await request(app).get('/devis');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/devis EduConnect/i);
    expect(res.text).toMatch(/Cycle scolaire/i);
    expect(res.text).toMatch(/name="cycleType"/);
    expect(res.text).toMatch(/Primaire/);
    expect(res.text).toMatch(/Collège/);
    expect(res.text).toMatch(/Lycée/);
    expect(res.text).toMatch(/Récapitulatif tarifaire/i);
    expect(res.text).toMatch(/name="_csrf"/);
    expect(res.text).toMatch(/Visibilité web/i);
    expect(res.headers['set-cookie']?.join(';')).toMatch(/edu_csrf=|devis_csrf=/);
  });

  test('GET /devis?convention=lycee pre-selects Lycée', async () => {
    const res = await request(app).get('/devis?convention=lycee');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Demande de convention/i);
    expect(res.text).toMatch(/value="LYCEE"[^>]*checked|checked[^>]*value="LYCEE"/);
    expect(res.text).toMatch(/convention signée/i);
  });

  test('POST /devis creates primaire quote at 50000 FCFA', async () => {
    const page = await request(app).get('/devis');
    const token = csrfFrom(page);
    prisma.quoteRequest.create.mockResolvedValue(sampleQuote());

    const res = await request(app)
      .post('/devis')
      .set('Cookie', page.headers['set-cookie'])
      .type('form')
      .send(baseFormFields(token, {
        lifeCanteen: 'on',
        adminAccounting: 'on',
        commSms: 'on',
      }));

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/devis/${QUOTE_ID}`);
    expect(prisma.quoteRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        amount: 50000,
        schoolName: 'Groupe Scolaire Les Palmiers',
        city: 'Abidjan',
        status: 'pending',
      }),
    }));
    const answers = prisma.quoteRequest.create.mock.calls[0][0].data.answers;
    expect(answers.cycleType).toBe('PRIMAIRE');
    expect(answers.cycleLabel).toBe('Primaire');
    expect(prisma.quoteRequest.create.mock.calls[0][0].data.marketplaceAmount).toBe(0);
  });

  test('POST /devis creates college quote at 80000 FCFA', async () => {
    const page = await request(app).get('/devis');
    const token = csrfFrom(page);
    prisma.quoteRequest.create.mockResolvedValue(sampleQuote({
      amount: 80000,
      answers: {
        ...sampleQuote().answers,
        cycleType: 'COLLEGE',
        cycleLabel: 'Collège',
      },
    }));

    const res = await request(app)
      .post('/devis')
      .set('Cookie', page.headers['set-cookie'])
      .type('form')
      .send(baseFormFields(token, { cycleType: 'COLLEGE' }));

    expect(res.status).toBe(302);
    expect(prisma.quoteRequest.create.mock.calls[0][0].data.amount).toBe(80000);
    expect(prisma.quoteRequest.create.mock.calls[0][0].data.answers.cycleType).toBe('COLLEGE');
  });

  test('POST /devis lycée stores convention flag with zero amount', async () => {
    const page = await request(app).get('/devis?convention=lycee');
    const token = csrfFrom(page);
    prisma.quoteRequest.create.mockResolvedValue(sampleQuote({
      amount: 0,
      answers: {
        ...sampleQuote().answers,
        cycleType: 'LYCEE',
        cycleLabel: 'Lycée',
        conventionOnly: true,
      },
    }));

    const res = await request(app)
      .post('/devis')
      .set('Cookie', page.headers['set-cookie'])
      .type('form')
      .send(baseFormFields(token, { cycleType: 'LYCEE' }));

    expect(res.status).toBe(302);
    expect(prisma.quoteRequest.create.mock.calls[0][0].data.amount).toBe(0);
    expect(prisma.quoteRequest.create.mock.calls[0][0].data.answers.conventionOnly).toBe(true);
  });

  test('POST /devis rejects missing cycle', async () => {
    const page = await request(app).get('/devis');
    const token = csrfFrom(page);

    const res = await request(app)
      .post('/devis')
      .set('Cookie', page.headers['set-cookie'])
      .type('form')
      .send(baseFormFields(token, { cycleType: '' }));

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/cycle scolaire/i);
    expect(prisma.quoteRequest.create).not.toHaveBeenCalled();
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
      .send(baseFormFields(token, { marketplaceTier: 'PREMIUM' }));

    expect(res.status).toBe(302);
    expect(prisma.quoteRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        amount: 50000,
        marketplaceAmount: 150000,
      }),
    }));
  });

  test('quoteSummary totals cycle amount and Marketplace', () => {
    const parsed = parseQuoteBody({
      cycleType: 'COLLEGE',
      schoolName: 'Test',
      city: 'Abidjan',
      students: '100',
      teachers: '10',
      classes: '5',
      marketplaceTier: 'VIP',
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.amount).toBe(80000);
    expect(parsed.marketplaceAmount).toBe(300000);
    expect(parsed.totalAmount).toBe(80000 + 300000);
    const summary = quoteSummary(parsed.answers);
    expect(summary.totalAmount).toBe(80000 + 300000);
    expect(summary.cycleLabel).toBe('Collège');
    expect(MARKETPLACE_OFFER_OPTIONS.some((o) => o.value === 'VIP' && o.amount === 300000)).toBe(true);
  });

  test('quoteSummary lycée is convention only without price', () => {
    const parsed = parseQuoteBody({
      cycleType: 'LYCEE',
      schoolName: 'Lycée Moderne',
      city: 'Abidjan',
      students: '800',
      teachers: '45',
      classes: '24',
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.amount).toBe(0);
    const summary = quoteSummary(parsed.answers);
    expect(summary.conventionOnly).toBe(true);
    expect(summary.conventionMessage).toMatch(/convention signée/i);
    expect(summary.amount).toBe(0);
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

  test('GET /devis/:id shows primaire amount', async () => {
    prisma.quoteRequest.findUnique.mockResolvedValue(sampleQuote());
    const res = await request(app).get(`/devis/${QUOTE_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/50\s*000/);
    expect(res.text).toMatch(/devis-offer-price/);
    expect(res.text).toMatch(/Contribution parentale/i);
    expect(res.text).toMatch(/2\s*500/);
    expect(res.text).toMatch(/Primaire/);
  });

  test('GET /devis/:id lycée shows convention not price', async () => {
    prisma.quoteRequest.findUnique.mockResolvedValue(sampleQuote({
      amount: 0,
      answers: {
        ...sampleQuote().answers,
        cycleType: 'LYCEE',
        cycleLabel: 'Lycée',
        conventionOnly: true,
      },
    }));
    const res = await request(app).get(`/devis/${QUOTE_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Convention signée/i);
    expect(res.text).toMatch(/convention signée/i);
    expect(res.text).not.toMatch(/devis-offer-price.*50\s*000/s);
    expect(res.text).not.toMatch(/devis-offer-price.*80\s*000/s);
  });

  test('home HTML links to /devis without publishing cycle prices', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/href="\/devis"/);
    expect(res.text).toMatch(/Obtenir un devis/i);
    expect(res.text).not.toMatch(/Offre Pro/);
  });

  test('tarification amounts match /tarifs page', () => {
    expect(quoteAmountForCycle('PRIMAIRE')).toBe(50000);
    expect(quoteAmountForCycle('COLLEGE')).toBe(80000);
    expect(quoteAmountForCycle('LYCEE')).toBe(0);
  });
});
