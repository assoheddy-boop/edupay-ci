const { sendNotification, NOTIFICATION_TYPES } = require('../services/NotificationService');

describe('NotificationService', () => {
  test('exposes the three event types', () => {
    expect(NOTIFICATION_TYPES).toHaveProperty('payment_validated');
    expect(NOTIFICATION_TYPES).toHaveProperty('absence_reported');
    expect(NOTIFICATION_TYPES).toHaveProperty('late_reported');
    expect(NOTIFICATION_TYPES).toHaveProperty('new_homework');
    expect(NOTIFICATION_TYPES).toHaveProperty('homework_reminder');
    expect(NOTIFICATION_TYPES.homework_reminder.sms).toBe(true);
    expect(NOTIFICATION_TYPES.new_homework.sms).toBe(true);
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
