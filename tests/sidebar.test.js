const fs = require('fs');
const path = require('path');

const sidebar = fs.readFileSync(
  path.join(__dirname, '../views/partials/_sidebar.ejs'),
  'utf8',
);

describe('sidebar missing links (Vague 3)', () => {
  test('school nav includes lost items when the module is on', () => {
    expect(sidebar).toMatch(/on\('lost_items'\)[\s\S]*\/school\/lost-items/);
  });

  test('parent nav includes pickup when the module is on', () => {
    expect(sidebar).toMatch(/on\('pickup'\)[\s\S]*\/parent\/pickup/);
  });

  test('teacher nav includes behavior when the module is on', () => {
    expect(sidebar).toMatch(/on\('behavior'\)[\s\S]*\/teacher\/behavior/);
  });

  test('school nav includes official SMS when the module is on', () => {
    expect(sidebar).toMatch(/on\('sms_official'\)[\s\S]*\/school\/sms/);
  });
});
