const { findSeoLanding, listSeoLandingPaths, MARKETPLACE_SEO_LANDINGS } = require('../src/config/marketplaceSeoRoutes');
const { schoolLocality, resolveSchoolMapPosition, publicSchoolMapMarker } = require('../src/utils/publicPortal');
const { educonnectVerifiedBadge } = require('../src/utils/marketplaceAddon');
const { buildAnalyticsSeries } = require('../src/services/portalAnalytics');
const {
  listDistinctCommunes,
  listDistinctCities,
} = require('../src/services/marketplace');

jest.mock('../src/config/database', () => ({
  school: { findMany: jest.fn() },
}));

const prisma = require('../src/config/database');

describe('marketplaceSeoRoutes', () => {
  test('exposes local SEO landings', () => {
    expect(MARKETPLACE_SEO_LANDINGS.length).toBeGreaterThanOrEqual(5);
    expect(findSeoLanding('colleges-abidjan')).toMatchObject({
      ville: 'Abidjan',
      cycle: 'COLLEGE',
    });
    expect(findSeoLanding('colleges-yopougon')).toMatchObject({
      commune: 'Yopougon',
      cycle: 'COLLEGE',
    });
    expect(listSeoLandingPaths()).toContain('/ecoles/colleges-abidjan');
  });
});

describe('commune field', () => {
  test('schoolLocality prefers dedicated commune column', () => {
    expect(schoolLocality({ commune: 'Yopougon', city: 'Abidjan', campusLabel: 'Sideci' })).toEqual({
      commune: 'Yopougon',
      city: 'Abidjan',
    });
  });
});

describe('verified badge', () => {
  test('Premium and VIP get Vérifié EduConnect', () => {
    expect(educonnectVerifiedBadge({ marketplaceTier: 'PREMIUM' }).label).toBe('Vérifié EduConnect');
    expect(educonnectVerifiedBadge({ marketplaceTier: 'VIP' }).className).toBe('is-verified');
    expect(educonnectVerifiedBadge({ marketplaceTier: 'STANDARD' }).label).toBe('Partenaire EduConnect');
    expect(educonnectVerifiedBadge({ marketplaceTier: 'NONE' })).toBeNull();
  });
});

describe('distinct locality filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.school.findMany.mockResolvedValue([
      { commune: 'Yopougon', campusLabel: null, city: 'Abidjan' },
      { commune: null, campusLabel: 'Cocody', city: 'Abidjan' },
      { commune: 'Yopougon', campusLabel: 'Sideci', city: 'Abidjan' },
      { commune: null, campusLabel: null, city: 'Bouaké' },
      { commune: null, campusLabel: 'Abidjan', city: 'Abidjan' },
    ]);
  });

  test('listDistinctCommunes dedupes commune and campus labels', async () => {
    const communes = await listDistinctCommunes();
    expect(communes).toEqual(expect.arrayContaining(['Yopougon', 'Cocody']));
    expect(communes.filter((v) => v === 'Yopougon')).toHaveLength(1);
    expect(communes).not.toContain('Abidjan');
  });

  test('listDistinctCities returns sorted unique cities', async () => {
    const cities = await listDistinctCities();
    expect(cities).toEqual(['Abidjan', 'Bouaké']);
  });
});

describe('map markers', () => {
  test('resolveSchoolMapPosition prefers GPS then commune center', () => {
    expect(resolveSchoolMapPosition({ lat: 5.1, lng: -4.2 })).toEqual({
      lat: 5.1,
      lng: -4.2,
      source: 'gps',
    });
    expect(resolveSchoolMapPosition({
      commune: 'Yopougon',
      city: 'Abidjan',
    }).source).toBe('commune');
    expect(resolveSchoolMapPosition({
      city: 'Bouaké',
    }).source).toBe('city');
    expect(resolveSchoolMapPosition({ city: 'Inconnu' })).toBeNull();
  });

  test('publicSchoolMapMarker builds leaflet-ready payload', () => {
    const marker = publicSchoolMapMarker({
      name: 'IGEST',
      slug: 'igest-yopougon-sideci',
      city: 'Abidjan',
      commune: 'Yopougon',
      educationCycle: 'COLLEGE',
      lat: 5.33,
      lng: -4.08,
    });
    expect(marker).toMatchObject({
      slug: 'igest-yopougon-sideci',
      portalPath: '/e/igest-yopougon-sideci',
      lat: 5.33,
      lng: -4.08,
      source: 'gps',
    });
  });
});

describe('portal analytics series', () => {
  test('buildAnalyticsSeries fills missing days with zero', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const series = buildAnalyticsSeries([
      { day: yesterday, views: 3, payClicks: 1, loginClicks: 0, contactSubmits: 2 },
    ], 3);
    expect(series).toHaveLength(3);
    expect(series[1].views).toBe(3);
    expect(series[0].views).toBe(0);
    expect(series[2].views).toBe(0);
    expect(series[1].label).toMatch(/\d/);
  });
});
