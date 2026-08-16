const { sendNotification, NOTIFICATION_TYPES } = require('../services/NotificationService');

describe('NotificationService', () => {
  test('exposes the three event types', () => {
    expect(NOTIFICATION_TYPES).toHaveProperty('payment_validated');
    expect(NOTIFICATION_TYPES).toHaveProperty('absence_reported');
    expect(NOTIFICATION_TYPES).toHaveProperty('late_reported');
    expect(NOTIFICATION_TYPES).toHaveProperty('new_homework');
  });

  test('rejects unknown type', async () => {
    await expect(sendNotification('user-1', 'unknown', 'hello')).resolves.toEqual({
      ok: false,
      error: 'type',
    });
  });

  test('rejects missing user or message', async () => {
    await expect(sendNotification(null, 'new_homework', 'x')).resolves.toEqual({
      ok: false,
      error: 'data',
    });
    await expect(sendNotification('u', 'new_homework', '')).resolves.toEqual({
      ok: false,
      error: 'data',
    });
  });
});
