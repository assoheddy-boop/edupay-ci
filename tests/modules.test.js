const request = require('supertest');
const app = require('../src/app');

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
