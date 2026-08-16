/**
 * Vérification complète EduConnect — node scripts/verify-all.js
 */
require('dotenv/config');
const http = require('http');

const BASE = process.env.VERIFY_URL || 'http://localhost:3000';
const ACCOUNTS = [
  { name: 'Admin', email: 'admin@educonnect.ci', password: 'demo1234', dashboard: '/admin/dashboard' },
  { name: 'Groupe', email: 'groupe@demo.ci', password: 'demo1234', dashboard: '/group/dashboard' },
  { name: 'École', email: 'ecole@demo.ci', password: 'demo1234', dashboard: '/school/dashboard' },
  { name: 'Parent', email: 'parent@demo.ci', password: 'demo1234', dashboard: '/parent/dashboard' },
  { name: 'Prof', email: 'prof@demo.ci', password: 'demo1234', dashboard: '/teacher/dashboard' },
];

const ROUTES_BY_ROLE = {
  Admin: ['/admin/dashboard', '/admin/modules', '/admin/organizations'],
  Groupe: [
    '/group/dashboard', '/group/campuses', '/group/finance', '/group/hr',
    '/group/compare', '/group/circulars', '/group/settings',
  ],
  École: [
    '/school/classes', '/school/students', '/school/students/import/template', '/school/payments', '/school/fees',
    '/school/stats', '/school/bulletins', '/school/messages', '/school/canteen',
    '/school/pickup', '/school/settings', '/school/modules', '/school/accounting',
    '/school/teachers', '/school/school-year', '/school/homeworks',
  ],
  Parent: [
    '/parent/payments', '/parent/grades', '/parent/homeworks', '/parent/suivi',
    '/parent/timeline', '/parent/messages', '/parent/pickup', '/parent/activities',
    '/parent/notifications',
  ],
  Prof: [
    '/teacher/students', '/teacher/grades', '/teacher/bulk-grades', '/teacher/absences',
    '/teacher/attendance', '/teacher/homeworks', '/teacher/transport', '/teacher/behavior',
    '/teacher/health', '/teacher/schedule', '/teacher/messages',
  ],
};

function request(method, path, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {},
    };
    if (cookie) opts.headers.Cookie = cookie;
    if (body) {
      opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        resolve({ status: res.statusCode, location: res.headers.location, setCookie, data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function extractCookie(setCookie) {
  if (!setCookie) return null;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  return arr.map((c) => c.split(';')[0]).join('; ');
}

async function login(account) {
  const body = new URLSearchParams({ email: account.email, password: account.password, role: 'parent' }).toString();
  const res = await request('POST', '/auth/login', { body });
  const cookie = extractCookie(res.setCookie);
  const ok = res.status === 302 && cookie;
  return { ok, cookie, status: res.status, location: res.location };
}

async function checkRoute(path, cookie) {
  const res = await request('GET', path, { cookie });
  const ok = res.status === 200 && !res.data.includes('Page introuvable') && !res.data.includes('Erreur serveur');
  return { path, status: res.status, ok };
}

async function main() {
  console.log('=== EduConnect — Vérification complète ===\n');
  console.log('URL:', BASE);

  const health = await request('GET', '/api/health');
  console.log(health.status === 200 ? '✅ API health' : '❌ API health', health.status);

  const home = await request('GET', '/');
  console.log(home.status === 200 ? '✅ Page accueil' : '❌ Page accueil', home.status);

  const loginPage = await request('GET', '/auth/login');
  console.log(loginPage.status === 200 ? '✅ Page login' : '❌ Page login', loginPage.status);

  let totalOk = 0;
  let totalFail = 0;

  for (const account of ACCOUNTS) {
    console.log(`\n--- ${account.name} (${account.email}) ---`);
    const loginResult = await login(account);
    if (!loginResult.ok) {
      console.log('❌ Connexion échouée', loginResult.status, loginResult.location);
      totalFail++;
      continue;
    }
    console.log('✅ Connexion OK →', loginResult.location || account.dashboard);

    const dash = await checkRoute(account.dashboard, loginResult.cookie);
    console.log(dash.ok ? '✅ Dashboard' : '❌ Dashboard', dash.status);

    const routes = ROUTES_BY_ROLE[account.name] || [];
    for (const route of routes) {
      const r = await checkRoute(route, loginResult.cookie);
      if (r.ok) {
        console.log('  ✅', route);
        totalOk++;
      } else {
        console.log('  ❌', route, 'HTTP', r.status);
        totalFail++;
      }
    }
  }

  try {
    const prisma = require('../src/config/database');
    const [users, schools, students, classes, fees] = await Promise.all([
      prisma.user.count(),
      prisma.school.count(),
      prisma.student.count(),
      prisma.class.count(),
      prisma.feeType.count(),
    ]);
    console.log('\n--- Base de données ---');
    console.log(`✅ users=${users} schools=${schools} students=${students} classes=${classes} fees=${fees}`);
    await prisma.$disconnect();
  } catch (e) {
    console.log('❌ Base de données:', e.message);
    totalFail++;
  }

  console.log('\n=== RÉSUMÉ ===');
  console.log(`Routes OK: ${totalOk} | Échecs: ${totalFail}`);
  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
