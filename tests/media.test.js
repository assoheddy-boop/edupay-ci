const { initials } = require('../src/utils/media');
const { logoSrcFor, publicPathFromLogoFile } = require('../src/utils/schoolLogo');

describe('media initials', () => {
  test('uses first letters of first and last name', () => {
    expect(initials('Kofi', 'Koné')).toBe('KK');
  });

  test('falls back to a question mark when names are empty', () => {
    expect(initials('', '')).toBe('?');
    expect(initials()).toBe('?');
  });
});

describe('logoSrcFor', () => {
  test('uses the public catalog file for La Bonne Main de Dieu', () => {
    expect(publicPathFromLogoFile('public/img/schools/epv-la-bonne-main-de-dieu.png'))
      .toBe('/img/schools/epv-la-bonne-main-de-dieu.png');
    expect(logoSrcFor({
      slug: 'epv-la-bonne-main-de-dieu',
      logoUrl: '/uploads/logos/abc.png',
      logoBase64: `data:image/png;base64,${'A'.repeat(200000)}`,
    })).toBe('/img/schools/epv-la-bonne-main-de-dieu.png');
  });

  test('keeps a small data URI when no public file exists', () => {
    expect(logoSrcFor({ logoBase64: 'data:image/png;base64,abc', logoUrl: '/uploads/x.png' }))
      .toBe('data:image/png;base64,abc');
  });
});
