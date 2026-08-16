jest.mock('../src/config/database', () => ({
  notificationJob: {
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  notification: { create: jest.fn() },
  user: { findUnique: jest.fn() },
  consent: { findUnique: jest.fn() },
}));

jest.mock('../src/config/socket', () => ({
  emitToUser: jest.fn(),
  getIo: jest.fn(),
}));

jest.mock('../src/services/sms', () => ({
  sendSms: jest.fn().mockResolvedValue({ ok: true, provider: 'console' }),
  sendWhatsApp: jest.fn().mockResolvedValue({ ok: false, reason: 'not_configured' }),
}));

jest.mock('../src/services/webPush', () => ({
  sendWebPush: jest.fn().mockResolvedValue({ ok: false, reason: 'no_vapid' }),
  vapidEnabled: jest.fn().mockReturnValue(false),
}));

jest.mock('../src/services/email', () => ({
  sendEmail: jest.fn().mockResolvedValue({ ok: false, reason: 'no_smtp', skip: true }),
  smtpConfigured: jest.fn().mockReturnValue(false),
}));

const prisma = require('../src/config/database');
const { sendSms } = require('../src/services/sms');
const { sendEmail } = require('../src/services/email');
const { sendWebPush } = require('../src/services/webPush');
const {
  sendNotification,
  enqueue,
  processPendingJobs,
  NOTIFICATION_TYPES,
  CHANNELS,
  MAX_ATTEMPTS,
} = require('../services/NotificationService');

function jobFromCreate(data, id) {
  return {
    id: id || `job-${data.channel}`,
    attempts: 0,
    status: 'pending',
    scheduledAt: new Date(),
    ...data,
  };
}

describe('NotificationService types', () => {
  test('exposes the three event types', () => {
    expect(NOTIFICATION_TYPES).toHaveProperty('payment_validated');
    expect(NOTIFICATION_TYPES).toHaveProperty('absence_reported');
    expect(NOTIFICATION_TYPES).toHaveProperty('late_reported');
    expect(NOTIFICATION_TYPES).toHaveProperty('new_homework');
    expect(NOTIFICATION_TYPES).toHaveProperty('homework_reminder');
    expect(NOTIFICATION_TYPES).toHaveProperty('payment_refused');
    expect(NOTIFICATION_TYPES).toHaveProperty('new_message');
    expect(NOTIFICATION_TYPES.homework_reminder.sms).toBe(true);
    expect(NOTIFICATION_TYPES.new_homework.sms).toBe(true);
    expect(NOTIFICATION_TYPES.payment_refused.eventType).toBe('PAYMENT_REFUSED');
    expect(NOTIFICATION_TYPES.new_message.sms).toBe(false);
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

describe('enqueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.notificationJob.create.mockImplementation(async ({ data }) => jobFromCreate(data));
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.update.mockImplementation(async ({ data }) => data);
    prisma.notification.create.mockResolvedValue({
      id: 'n1',
      createdAt: new Date('2026-08-16T10:00:00Z'),
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      phone: '0700000000',
      email: 'parent@educonnect-ci.com',
    });
    prisma.consent.findUnique.mockResolvedValue(null);
  });

  test('creates pending jobs per channel and sends in-app immediately', async () => {
    const result = await sendNotification('u1', 'absence_reported', 'Awa absente le 16/08/2026.');
    expect(result.ok).toBe(true);
    const channels = prisma.notificationJob.create.mock.calls.map((call) => call[0].data.channel);
    expect(channels).toEqual([
      CHANNELS.IN_APP,
      CHANNELS.SMS,
      CHANNELS.EMAIL,
      CHANNELS.PUSH,
    ]);
    expect(prisma.notificationJob.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1',
      eventType: 'ABSENCE',
      status: 'pending',
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        type: 'ABSENCE',
        title: 'Absence signalée',
        body: 'Awa absente le 16/08/2026.',
      }),
    });
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'job-IN_APP' },
      data: expect.objectContaining({ status: 'sent' }),
    }));
  });

  test('message events skip SMS but still queue email and push', async () => {
    await sendNotification('u1', 'new_message', 'Marie : Bonjour');
    const channels = prisma.notificationJob.create.mock.calls.map((call) => call[0].data.channel);
    expect(channels).toEqual([CHANNELS.IN_APP, CHANNELS.EMAIL, CHANNELS.PUSH]);
  });

  test('enqueue rejects unknown eventType', async () => {
    await expect(enqueue({ userId: 'u1', eventType: 'NOPE', payload: { body: 'x' } })).resolves.toEqual({
      ok: false,
      error: 'type',
    });
  });
});

describe('worker status transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      phone: '0700000000',
      email: 'parent@educonnect-ci.com',
    });
    prisma.consent.findUnique.mockResolvedValue(null);
  });

  test('pending SMS becomes sent', async () => {
    sendSms.mockResolvedValueOnce({ ok: true, provider: 'console' });
    prisma.notificationJob.findMany.mockResolvedValue([{
      id: 'sms-1',
      userId: 'u1',
      channel: 'SMS',
      eventType: 'LATE',
      payload: { title: 'Retard signalé', body: 'Koffi en retard.' },
      status: 'pending',
      attempts: 0,
      scheduledAt: new Date(),
    }]);

    const result = await processPendingJobs();
    expect(result).toMatchObject({ ok: true, scanned: 1, sent: 1, failed: 0 });
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sms-1' },
      data: expect.objectContaining({ status: 'sent', error: null }),
    }));
  });

  test('pending email without SMTP becomes skipped', async () => {
    sendEmail.mockResolvedValueOnce({ ok: false, reason: 'no_smtp', skip: true });
    prisma.notificationJob.findMany.mockResolvedValue([{
      id: 'mail-1',
      userId: 'u1',
      channel: 'EMAIL',
      eventType: 'HOMEWORK_REMIND',
      payload: { title: 'Rappel devoir', body: 'Maths demain.' },
      status: 'pending',
      attempts: 0,
      scheduledAt: new Date(),
    }]);

    const result = await processPendingJobs();
    expect(result.skipped).toBe(1);
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'skipped', error: 'no_smtp' }),
    }));
  });

  test('pending push without VAPID becomes skipped', async () => {
    sendWebPush.mockResolvedValueOnce({ ok: false, reason: 'no_vapid' });
    prisma.notificationJob.findMany.mockResolvedValue([{
      id: 'push-1',
      userId: 'u1',
      channel: 'PUSH',
      eventType: 'MESSAGE',
      payload: { title: 'Nouveau message', body: 'Bonjour' },
      status: 'pending',
      attempts: 0,
      scheduledAt: new Date(),
    }]);

    const result = await processPendingJobs();
    expect(result.skipped).toBe(1);
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'skipped', error: 'no_vapid' }),
    }));
  });

  test('failed SMS becomes error and stays retryable under MAX_ATTEMPTS', async () => {
    sendSms.mockResolvedValueOnce({ ok: false, reason: 'timeout' });
    prisma.notificationJob.findMany.mockResolvedValue([{
      id: 'sms-err',
      userId: 'u1',
      channel: 'SMS',
      eventType: 'PAYMENT_VALIDATED',
      payload: { title: 'Paiement validé', body: '25 000 FCFA confirmés.' },
      status: 'pending',
      attempts: 0,
      scheduledAt: new Date(),
    }]);

    const result = await processPendingJobs();
    expect(result.failed).toBe(1);
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'error', error: 'timeout' }),
    }));
    expect(prisma.notificationJob.findMany.mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([
        { status: 'error', attempts: { lt: MAX_ATTEMPTS } },
      ]),
    );
  });

  test('revoked marketing consent skips non-critical channels', async () => {
    prisma.consent.findUnique.mockResolvedValue({ status: 'REVOKED' });
    prisma.notificationJob.findMany.mockResolvedValue([{
      id: 'mail-mkt',
      userId: 'u1',
      channel: 'EMAIL',
      eventType: 'MESSAGE',
      payload: { title: 'Nouveau message', body: 'Bonjour' },
      status: 'pending',
      attempts: 0,
      scheduledAt: new Date(),
    }]);

    const result = await processPendingJobs();
    expect(result.skipped).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'skipped', error: 'consent_revoked' }),
    }));
  });
});
