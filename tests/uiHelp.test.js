const { UI_HELP, getUiHelp } = require('../src/utils/uiHelp');

describe('uiHelp', () => {
  test('exposes help keys for nav and pages', () => {
    expect(getUiHelp('nav.administration')).toMatchObject({ text: expect.any(String) });
    expect(getUiHelp('page.reinscription')).toBeTruthy();
    expect(getUiHelp('situation.finance')).toBeTruthy();
    expect(Object.keys(UI_HELP).length).toBeGreaterThan(20);
  });

  test('returns null for unknown key', () => {
    expect(getUiHelp('missing.key')).toBeNull();
  });
});
