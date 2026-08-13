const { initials } = require('../src/utils/media');

describe('media initials', () => {
  test('uses first letters of first and last name', () => {
    expect(initials('Kofi', 'Koné')).toBe('KK');
  });

  test('falls back to a question mark when names are empty', () => {
    expect(initials('', '')).toBe('?');
    expect(initials()).toBe('?');
  });
});
