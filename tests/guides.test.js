const request = require('supertest');
const app = require('../src/app');
const { listGuides, parseBlocks, markdownToHtml } = require('../src/utils/guideMarkdown');

const PAGES = [
  { path: '/guide/direction', title: 'Guide direction', marker: 'SMS officiel' },
  { path: '/guide/parent', title: 'Guide parent', marker: 'matricule' },
  { path: '/guide/enseignant', title: 'Guide enseignant', marker: 'Présent' },
];

describe('Public user guides', () => {
  test.each(PAGES)('GET $path is public and names EduConnect', async ({ path, title, marker }) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    expect(res.text).toMatch(/Alliance Digitale Internationale/);
    expect(res.text).toMatch(/EduConnect/);
    expect(res.text).toMatch(/educonnect-ci\.com/);
    expect(res.text).toMatch(new RegExp(marker, 'i'));
    expect(res.text).not.toMatch(/EduPay SAS/i);
    expect(res.text).not.toMatch(/Location:\s*\/auth\/login/i);
    expect(res.text).not.toMatch(/prise en main/i);
    expect(res.text).not.toMatch(/SUPER_ADMIN/i);
  });

  test('GET /guides lists the three roles', async () => {
    const res = await request(app).get('/guides');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Guide direction/);
    expect(res.text).toMatch(/Guide parent/);
    expect(res.text).toMatch(/Guide enseignant/);
    expect(res.text).toMatch(/Alliance Digitale Internationale/);
    expect(res.text).not.toMatch(/EduPay SAS/i);
  });

  test('GET /guide redirects to /guides', async () => {
    const res = await request(app).get('/guide');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/guides');
  });

  test.each(PAGES)('GET $path.pdf serves the PDF', async ({ path }) => {
    const res = await request(app).get(`${path}.pdf`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/i);
    expect(res.body.length).toBeGreaterThan(8000);
  });

  test('home and login footers link to Guides', async () => {
    const home = await request(app).get('/');
    expect(home.status).toBe(200);
    expect(home.text).toMatch(/href="\/guides"/);
    const login = await request(app).get('/auth/login');
    expect(login.status).toBe(200);
    expect(login.text).toMatch(/href="\/guides"/);
  });

  test('parent and teacher guides do not mention admin assist', () => {
    const parent = require('fs').readFileSync(require('path').join(__dirname, '../docs/guide-parent.md'), 'utf8');
    const teacher = require('fs').readFileSync(require('path').join(__dirname, '../docs/guide-enseignant.md'), 'utf8');
    expect(parent).not.toMatch(/super.?admin/i);
    expect(teacher).not.toMatch(/super.?admin/i);
    expect(parent).not.toMatch(/prise en main/i);
    expect(teacher).not.toMatch(/prise en main/i);
  });

  test('markdown parser keeps callouts and lists', () => {
    const md = '# Titre\n\n## Section\n\n> **Note**\n> Corps\n\n1. Un\n2. Deux\n\n- A\n- B\n';
    const blocks = parseBlocks(md);
    expect(blocks.map((b) => b.type)).toEqual(['h1', 'h2', 'callout', 'ol', 'ul']);
    const html = markdownToHtml(md);
    expect(html).toMatch(/guide-callout/);
    expect(html).toMatch(/<ol>/);
    expect(listGuides()).toHaveLength(3);
  });

  test('markdown parser joins wrapped paragraph and callout lines', () => {
    const md = 'Bonjour\nle monde.\n\n> **Note**\n> Ligne un\n> ligne deux\n';
    const blocks = parseBlocks(md);
    expect(blocks[0]).toEqual({ type: 'p', text: 'Bonjour le monde.' });
    expect(blocks[1]).toMatchObject({
      type: 'callout',
      title: 'Note',
      text: 'Ligne un ligne deux',
    });
  });

  test('markdown parser keeps two-space hard line breaks', () => {
    const md = 'Site : https://educonnect-ci.com  \nConnexion : /auth/login\n';
    const blocks = parseBlocks(md);
    expect(blocks[0].text).toBe('Site : https://educonnect-ci.com\nConnexion : /auth/login');
  });
});
