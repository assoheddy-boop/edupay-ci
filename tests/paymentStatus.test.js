const { paymentStatusLabel, PAYMENT_STATUS_LABELS } = require('../src/utils/paymentStatus');

describe('paymentStatusLabel', () => {
  test('translates payment statuses to French', () => {
    expect(paymentStatusLabel('VALIDATED')).toBe('Validé');
    expect(paymentStatusLabel('PENDING')).toBe('En attente');
    expect(paymentStatusLabel('REJECTED')).toBe('Rejeté');
  });

  test('PAYMENT_STATUS_LABELS covers all enum values', () => {
    expect(Object.keys(PAYMENT_STATUS_LABELS).sort()).toEqual(['PENDING', 'REJECTED', 'VALIDATED']);
  });
});
