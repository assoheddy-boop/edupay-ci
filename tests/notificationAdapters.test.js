const { sendSms, sendWhatsApp } = require('../src/services/sms');
const { sendEmail, smtpConfigured } = require('../src/services/email');
const { sendWebPush, vapidEnabled } = require('../src/services/webPush');

describe('notification adapters without credentials', () => {
  const prev = {};

  beforeEach(() => {
    ['SMS_PROVIDER', 'ORANGE_SMS_URL', 'ORANGE_SMS_TOKEN', 'ORANGE_SMS_SENDER', 'SMTP_HOST', 'SMTP_FROM',
      'SMTP_USER', 'SMTP_PASS', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY',
      'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID'].forEach((key) => {
      prev[key] = process.env[key];
    });
    delete process.env.ORANGE_SMS_URL;
    delete process.env.ORANGE_SMS_TOKEN;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_ID;
  });

  afterEach(() => {
    Object.entries(prev).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  test('SMS without phone does not throw', async () => {
    await expect(sendSms(null, 'EduConnect test')).resolves.toMatchObject({ ok: false, reason: 'no_phone' });
  });

  test('Orange uses per-school sender, not the global default only', async () => {
    process.env.SMS_PROVIDER = 'orange';
    process.env.ORANGE_SMS_URL = 'https://example.test/sms';
    process.env.ORANGE_SMS_TOKEN = 'token';
    process.env.ORANGE_SMS_SENDER = 'EduConnect';
    const prevFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await expect(sendSms('0700000000', "École Sainte Marie : test", { sender: 'SteMarie' })).resolves.toMatchObject({
      ok: true,
      sender: 'SteMarie',
    });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.outboundSMSMessageRequest.senderAddress).toBe('SteMarie');
    global.fetch = prevFetch;
  });

  test('WhatsApp without token does not throw', async () => {
    await expect(sendWhatsApp('0700000000', 'EduConnect test')).resolves.toMatchObject({
      ok: false,
      reason: 'not_configured',
    });
  });

  test('email without SMTP does not throw', async () => {
    expect(smtpConfigured()).toBe(false);
    await expect(sendEmail('parent@educonnect-ci.com', {
      subject: 'EduConnect',
      text: 'Bonjour',
    })).resolves.toMatchObject({ ok: false, reason: 'no_smtp', skip: true });
  });

  test('email without recipient does not throw', async () => {
    await expect(sendEmail(null, { subject: 'x', text: 'y' })).resolves.toMatchObject({
      ok: false,
      reason: 'no_email',
      skip: true,
    });
  });

  test('web push without VAPID does not throw', async () => {
    expect(vapidEnabled()).toBe(false);
    await expect(sendWebPush('user-1', { title: 'EduConnect', body: 'Test' })).resolves.toMatchObject({
      ok: false,
      reason: 'no_vapid',
    });
  });
});
