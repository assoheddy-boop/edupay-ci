const { formatMoney } = require('../src/middleware/currency');

describe('formatMoney', () => {
  test('formats XOF amounts with the FCFA symbol', () => {
    expect(formatMoney(25000, 'XOF')).toMatch(/25\s*000 FCFA/);
  });

  test('converts stored FCFA integers for EUR display', () => {
    const text = formatMoney(65596, 'EUR');
    expect(text).toMatch(/€/);
    expect(text).not.toMatch(/FCFA/);
  });
});
