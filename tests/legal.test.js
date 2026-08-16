const request = require('supertest');
const app = require('../src/app');

const PAGES = [
  { path: '/mentions-legales', title: 'Mentions légales', marker: 'Alliance Digitale Internationale' },
  { path: '/confidentialite', title: 'Politique de confidentialité', marker: 'loi n° 2013-450' },
  { path: '/cgu', title: "Conditions générales d'utilisation", marker: 'Wave' },
  { path: '/cookies', title: 'Cookies', marker: 'pas de Google Analytics' },
];

const ALIASES = [
  ['/mentions', '/mentions-legales'],
  ['/legal', '/mentions-legales'],
  ['/privacy', '/confidentialite'],
  ['/conditions', '/cgu'],
];

describe('Public legal pages', () => {
  test.each(PAGES)('GET $path is public and names the editor', async ({ path, title, marker }) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    expect(res.text).toMatch(/Alliance Digitale Internationale/);
    expect(res.text).toMatch(/EduConnect/);
    expect(res.text).toMatch(/contact@educonnect\.ci/);
    expect(res.text).toMatch(new RegExp(marker, 'i'));
    expect(res.text).not.toMatch(/EduPay SAS/i);
    expect(res.text).not.toMatch(/Location:\s*\/auth\/login/i);
  });

  test.each(ALIASES)('GET %s serves the same public page as %s', async (alias) => {
    const res = await request(app).get(alias);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Alliance Digitale Internationale/);
  });

  test('home footer names Alliance Digitale Internationale and links legal pages', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Éditeur : Alliance Digitale Internationale/);
    expect(res.text).toMatch(/href="\/mentions-legales"/);
    expect(res.text).toMatch(/href="\/confidentialite"/);
    expect(res.text).toMatch(/href="\/cgu"/);
    expect(res.text).toMatch(/href="\/cookies"/);
    expect(res.text).not.toMatch(/EduPay SAS/i);
  });

  test('login page footer includes legal links', async () => {
    const res = await request(app).get('/auth/login');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Éditeur : Alliance Digitale Internationale/);
    expect(res.text).toMatch(/href="\/mentions-legales"/);
    expect(res.text).toMatch(/href="\/cgu"/);
  });
});
