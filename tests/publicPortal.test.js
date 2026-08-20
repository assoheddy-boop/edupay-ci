const {
  isReservedSlug,
  isPortalSlug,
  parsePublicPortalFields,
  sanitizeContact,
  publicSchoolView,
  seoForSchool,
  seoForMarketplace,
  jsonLdForSchool,
  robotsForPath,
  portalPath,
  sanitizeImageUrl,
  parseGallery,
  whatsappUrl,
} = require('../src/utils/publicPortal');
const { aggregateAverages } = require('../src/services/publicPortalStats');

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
    expect(view.marketplaceTier).toBe('NONE');
    expect(view.marketplaceBadge).toBeNull();
    expect(view.heading).toMatch(/Institut Général/);
    expect(view.commune).toBeNull();
    const seo = seoForSchool({
      name: 'IGEST',
      slug: 'igest-yopougon-sideci',
      city: 'Abidjan',
      campusLabel: 'Yopougon-Sideci',
      educationCycle: 'COLLEGE',
    });
    expect(seo.canonicalUrl).toMatch(/\/e\/igest-yopougon-sideci$/);
    expect(seo.title).toMatch(/IGEST/);
    expect(seo.title).toMatch(/Yopougon-Sideci/);
    expect(seo.title).toMatch(/Côte d’Ivoire/);
    expect(seo.title).not.toMatch(/à Abidjan, Côte/);
    const jsonLd = jsonLdForSchool({
      name: 'IGEST',
      slug: 'igest-yopougon-sideci',
      city: 'Abidjan',
      campusLabel: 'Yopougon-Sideci',
      address: 'Yopougon-Sideci, Abidjan',
      publicPhone: '05 45 47 48 29',
      lat: 5.336,
      lng: -4.086,
      educationCycle: 'COLLEGE',
    });
    expect(jsonLd['@type']).toEqual(['EducationalOrganization', 'LocalBusiness', 'School']);
    expect(jsonLd.name).toMatch(/Institut Général/);
    expect(jsonLd.alternateName).toBe('IGEST');
    expect(jsonLd.address.addressLocality).toBe('Yopougon-Sideci');
    expect(jsonLd.address.addressRegion).toBe('Abidjan');
    expect(jsonLd.address.addressCountry).toBe('CI');
    expect(jsonLd.telephone).toBe('05 45 47 48 29');
    expect(jsonLd.geo.latitude).toBe(5.336);
    expect(jsonLd.url).toMatch(/\/e\/igest-yopougon-sideci$/);
    expect(jsonLd).not.toHaveProperty('sameAs');
  });

  test('only SUPER_ADMIN can set featured from portal fields', () => {
    const schoolAdmin = parsePublicPortalFields({ publicFeatured: 'on' }, { user: { role: 'SCHOOL_ADMIN' } });
    expect(schoolAdmin.publicFeatured).toBeUndefined();
    const superAdmin = parsePublicPortalFields({ publicFeatured: 'on' }, { user: { role: 'SUPER_ADMIN' } });
    expect(superAdmin.publicFeatured).toBe(true);
  });

  test('gallery and banner reject SVG', () => {
    expect(sanitizeImageUrl('https://cdn.example/photo.svg')).toBeNull();
    expect(sanitizeImageUrl('/uploads/portal/x.svg')).toBeNull();
    expect(parseGallery('https://cdn.example/ok.jpg\nhttps://cdn.example/no.svg')).toEqual([
      'https://cdn.example/ok.jpg',
    ]);
    expect(sanitizeImageUrl('https://cdn.example/banner.png')).toBe('https://cdn.example/banner.png');
  });

  test('WhatsApp link uses the 225 country code from a public CI number', () => {
    expect(whatsappUrl('05 45 47 48 29')).toBe('https://wa.me/2250545474829');
  });

  test('anonymized aggregates never include pupil identities', () => {
    const stats = aggregateAverages([12.4, 8, 16], 'T1');
    expect(stats.hasData).toBe(true);
    expect(stats.successRate).toBe(67);
    expect(stats.overallAverage).toBe(12.1);
    expect(stats.overallAverageText).toBe('12,1/20');
    expect(stats.majorsCount).toBe(1);
    expect(JSON.stringify(stats)).not.toMatch(/Aya|Kouassi|matricule/i);
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

  test('marketplace SEO targets écoles CI and robots keep private areas out of the index', () => {
    const all = seoForMarketplace({});
    expect(all.title).toMatch(/Écoles en Côte d’Ivoire/);
    expect(all.title).toMatch(/collèges et lycées/);
    expect(all.heading).toBe('Écoles en Côte d’Ivoire');
    const college = seoForMarketplace({ cycle: 'COLLEGE', ville: 'Abidjan' });
    expect(college.heading).toBe('Collèges à Abidjan');
    expect(college.canonicalUrl).toMatch(/\/ecoles\?ville=Abidjan&cycle=COLLEGE/);
    expect(robotsForPath('/e/igest-yopougon-sideci')).toBe('index, follow');
    expect(robotsForPath('/ecoles')).toBe('index, follow');
    expect(robotsForPath('/auth/login')).toBe('noindex, nofollow');
    expect(robotsForPath('/school/dashboard')).toBe('noindex, nofollow');
    expect(robotsForPath('/parent/grades')).toBe('noindex, nofollow');
    expect(robotsForPath('/admin/schools')).toBe('noindex, nofollow');
  });
});
