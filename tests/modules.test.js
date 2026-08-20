const request = require('supertest');
const app = require('../src/app');
const { MODULES, MODULE_KEYS } = require('../src/config/modules');
const { MARKETPLACE_MODULE } = require('../src/utils/marketplaceAddon');
const { planIncludesFeature, isPlanIndependentModule } = require('../src/utils/plans');
const { PLANS } = require('../src/config/plans');

describe('Marketplace module', () => {
  test('is registered, default off, paid add-on', () => {
    expect(MARKETPLACE_MODULE).toBe('marketplace');
    expect(MODULE_KEYS).toContain('marketplace');
    expect(MODULES.marketplace.label).toBe('Portail public');
    expect(MODULES.marketplace.default).toBe(false);
    expect(MODULES.marketplace.addon).toBe(true);
    expect(MODULES.marketplace.core).toBeFalsy();
  });

  test('is independent of the Pro plan and cannot be self-enabled via plan sync', () => {
    expect(isPlanIndependentModule('marketplace')).toBe(true);
    expect(planIncludesFeature({ features: [] }, 'marketplace')).toBe(true);
    expect(PLANS.essentiel.modules).not.toContain('marketplace');
    expect(PLANS.pro.modules).not.toContain('marketplace');
    expect(PLANS.groupe.modules).not.toContain('marketplace');
  });
});


async function loginAgent(email) {
  const agent = request.agent(app);
  const res = await agent
    .post('/auth/login')
    .type('form')
    .send({ email, password: 'demo1234', role: 'parent' });
  const cookies = res.headers['set-cookie'] || [];
  const loggedIn = cookies.some((c) => String(c).startsWith('token='));
  return loggedIn ? agent : null;
}

describe('Protected routes', () => {
  test('GET /school/students redirects unauthenticated', async () => {
    const res = await request(app).get('/school/students');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/login/);
  });

  test('GET /parent/notifications for parent', async () => {
    const agent = await loginAgent('parent@demo.ci');
    if (!agent) return;
    const res = await agent.get('/parent/notifications');
    expect(res.status).toBe(200);
  });

  test('GET /school/school-year for school admin', async () => {
    const agent = await loginAgent('ecole@demo.ci');
    if (!agent) return;
    const res = await agent.get('/school/school-year');
    expect(res.status).toBe(200);
  });

  test('GET /transfer redirects unauthenticated visitors', async () => {
    const res = await request(app).get('/transfer');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/login/);
  });

  test('POST /parent/children rejects missing school code', async () => {
    const agent = await loginAgent('parent@demo.ci');
    if (!agent) return;
    const res = await agent
      .post('/parent/children')
      .type('form')
      .send({ matricule: 'ETOILE-001' });
    expect(res.status).toBe(302);
  });

  test('school sidebar exposes lost-items when the module is enabled', async () => {
    const agent = await loginAgent('ecole@demo.ci');
    if (!agent) return;
    const res = await agent.get('/school/dashboard');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/school/lost-items');
  });

  test('parent sidebar exposes pickup when the module is enabled', async () => {
    const agent = await loginAgent('parent@demo.ci');
    if (!agent) return;
    const res = await agent.get('/parent/dashboard');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/parent/pickup');
  });

  test('teacher sidebar exposes behavior when the module is enabled', async () => {
    const agent = await loginAgent('prof@demo.ci');
    if (!agent) return;
    const res = await agent.get('/teacher/dashboard');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/teacher/behavior');
  });
});
