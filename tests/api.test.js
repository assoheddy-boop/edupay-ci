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

describe('API v1', () => {
  test('GET /api/v1/notifications requires auth', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });

  test('POST /api/v1/sync requires auth', async () => {
    const res = await request(app).post('/api/v1/sync').send({ items: [] });
    expect(res.status).toBe(401);
  });

  test('GET /api/v1/notifications for parent', async () => {
    const agent = await loginAgent('parent@demo.ci');
    const res = await agent.get('/api/v1/notifications');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/v1/students for school admin', async () => {
    const agent = await loginAgent('ecole@demo.ci');
    const res = await agent.get('/api/v1/students');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/v1/classes for school admin', async () => {
    const agent = await loginAgent('ecole@demo.ci');
    const res = await agent.get('/api/v1/classes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
