const request = require('supertest');
const app = require('../src/app');

async function loginAgent(email) {
  const agent = request.agent(app);
  await agent
    .post('/auth/login')
    .type('form')
    .send({ email, password: 'demo1234', role: 'parent' });
  return agent;
}

describe('Protected routes', () => {
  test('GET /school/students redirects unauthenticated', async () => {
    const res = await request(app).get('/school/students');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/login/);
  });

  test('GET /parent/notifications for parent', async () => {
    const agent = await loginAgent('parent@demo.ci');
    const res = await agent.get('/parent/notifications');
    expect(res.status).toBe(200);
  });

  test('GET /school/school-year for school admin', async () => {
    const agent = await loginAgent('ecole@demo.ci');
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
    const res = await agent
      .post('/parent/children')
      .type('form')
      .send({ matricule: 'ETOILE-001' });
    expect(res.status).toBe(302);
  });
});
