const { findSeoLanding, listSeoLandingPaths, MARKETPLACE_SEO_LANDINGS } = require('../src/config/marketplaceSeoRoutes');
const { schoolLocality } = require('../src/utils/publicPortal');
const { educonnectVerifiedBadge } = require('../src/utils/marketplaceAddon');

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
