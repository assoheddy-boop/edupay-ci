const fs = require('fs');
const path = require('path');
const {
  DEMO_EMAIL_ALLOWLIST,
  SUPER_ADMIN_DEMO_EMAIL,
  isDemoEmail,
  isProtectedEmail,
} = require('../scripts/purge-demo-accounts');

describe('purge-demo-accounts allowlist', () => {
  test('marks historical demo logins and @demo.ci', () => {
    expect(DEMO_EMAIL_ALLOWLIST).toEqual(expect.arrayContaining([
      'ecole@demo.ci',
      'parent@demo.ci',
      'prof@demo.ci',
      'groupe@demo.ci',
    ]));
    expect(isDemoEmail('ecole@demo.ci')).toBe(true);
    expect(isDemoEmail('parent2@demo.ci')).toBe(true);
  });

  test('never flags IGEST or EPV partner emails', () => {
    expect(isProtectedEmail('igest@educonnect.ci')).toBe(true);
    expect(isDemoEmail('igest@educonnect.ci')).toBe(false);
    expect(isProtectedEmail('epv.fatoumaba@educonnect.ci')).toBe(true);
    expect(isDemoEmail('epv.fatoumaba@educonnect.ci')).toBe(false);
    expect(isProtectedEmail('igest@edupay.ci')).toBe(true);
    expect(isProtectedEmail('epv.fatoumaba@edupay.ci')).toBe(true);
  });

  test('does not auto-delete the Super Admin email', () => {
    expect(isDemoEmail(SUPER_ADMIN_DEMO_EMAIL)).toBe(false);
  });
});

describe('seed demo gate', () => {
  test('prisma/seed.js requires SEED_DEMO=true', () => {
    const seed = fs.readFileSync(path.join(__dirname, '../prisma/seed.js'), 'utf8');
    expect(seed).toMatch(/SEED_DEMO !== 'true'/);
    expect(seed).toMatch(/@demo\.ci/);
  });

  test('prisma/seed-rich.js requires SEED_DEMO=true', () => {
    const seed = fs.readFileSync(path.join(__dirname, '../prisma/seed-rich.js'), 'utf8');
    expect(seed).toMatch(/SEED_DEMO !== 'true'/);
  });
});
