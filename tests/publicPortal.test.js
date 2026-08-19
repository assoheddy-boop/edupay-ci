const {
  isReservedSlug,
  isPortalSlug,
  parsePublicPortalFields,
  sanitizeContact,
  publicSchoolView,
  seoForSchool,
  portalPath,
} = require('../src/utils/publicPortal');

describe('publicPortal helpers', () => {
  test('blocks reserved first segments so /devis and /school stay intact', () => {
    expect(isReservedSlug('devis')).toBe(true);
    expect(isReservedSlug('guides')).toBe(true);
    expect(isReservedSlug('auth')).toBe(true);
    expect(isReservedSlug('school')).toBe(true);
    expect(isPortalSlug('devis')).toBe(false);
    expect(isPortalSlug('igest-yopougon-sideci')).toBe(true);
    expect(portalPath('igest-yopougon-sideci')).toBe('/e/igest-yopougon-sideci');
  });

  test('parsePublicPortalFields is opt-in and drops invalid coordinates', () => {
    const off = parsePublicPortalFields({});
    expect(off.publicPortalEnabled).toBe(false);
    const on = parsePublicPortalFields({
      publicPortalEnabled: 'on',
      publicDescription: '  Collège à Yopougon  ',
      publicPhone: '05 45 47 48 29',
      lat: '5.34',
      lng: 'not-a-number',
    });
    expect(on.publicPortalEnabled).toBe(true);
    expect(on.publicDescription).toBe('Collège à Yopougon');
    expect(on.lat).toBe(5.34);
    expect(on.lng).toBeNull();
  });

  test('publicSchoolView never copies pupils, grades or Wave numbers', () => {
    const view = publicSchoolView({
      name: 'IGEST',
      slug: 'igest-yopougon-sideci',
      city: 'Abidjan',
      educationCycle: 'COLLEGE',
      publicDescription: 'Présentation',
      waveNumber: '07 11 22 33 44',
      students: [{ firstName: 'AyaKouassiSecret', grades: [{ value: 18 }] }],
      admin: { email: 'secret-director@hidden.ci' },
    });
    expect(view.payUrl).toBe('/auth/login');
    expect(view.loginUrl).toBe('/auth/login');
    expect(view).not.toHaveProperty('students');
    expect(view).not.toHaveProperty('waveNumber');
    expect(view).not.toHaveProperty('admin');
    const seo = seoForSchool({ name: 'IGEST', slug: 'igest-yopougon-sideci', city: 'Abidjan', educationCycle: 'COLLEGE' });
    expect(seo.canonicalUrl).toMatch(/\/e\/igest-yopougon-sideci$/);
    expect(seo.title).toMatch(/IGEST/);
  });

  test('contact honeypot is treated as spam without leaking content rules', () => {
    const spam = sanitizeContact({ website: 'https://spam.test', name: 'x', email: 'a@b.ci', message: 'hello there' });
    expect(spam.ok).toBe(false);
    expect(spam.spam).toBe(true);
    const good = sanitizeContact({
      name: 'Awa',
      email: 'awa@ecole.ci',
      message: 'Je souhaite des informations sur les inscriptions.',
    });
    expect(good.ok).toBe(true);
  });
});
