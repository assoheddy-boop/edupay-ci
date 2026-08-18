const {
  sendSms,
  sendWhatsApp,
  sendConnectivityTestSms,
  orangeConfigured,
  twilioConfigured,
  smsConfigured,
  normalizeCiMsisdn,
  normalizeCiE164,
  resetOrangeTokenCache,
  TEST_SMS_TEXT,
  CI_SENDER_ADDRESS,
  DEFAULT_SEND_URL,
  DEFAULT_TOKEN_URL,
  twilioMessagesUrl,
} = require('../src/services/sms');

const ORANGE_KEYS = [
  'SMS_PROVIDER', 'ORANGE_SMS_URL', 'ORANGE_SMS_TOKEN', 'ORANGE_SMS_SENDER',
  'ORANGE_SMS_CLIENT_ID', 'ORANGE_SMS_CLIENT_SECRET', 'ORANGE_SMS_TOKEN_URL',
];

const TWILIO_KEYS = [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER',
  'TWILIO_MESSAGING_SERVICE_SID', 'TWILIO_ALLOW_ALPHANUMERIC',
];

const SMS_ENV_KEYS = [...ORANGE_KEYS, ...TWILIO_KEYS];

function jsonRes(ok, body, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('notification adapters without credentials', () => {
  const prev = {};

  beforeEach(() => {
    ['SMS_PROVIDER', 'ORANGE_SMS_URL', 'ORANGE_SMS_TOKEN', 'ORANGE_SMS_SENDER', 'SMTP_HOST', 'SMTP_FROM',
      'SMTP_USER', 'SMTP_PASS', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY',
      'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID',
      'ORANGE_SMS_CLIENT_ID', 'ORANGE_SMS_CLIENT_SECRET', 'ORANGE_SMS_TOKEN_URL',
      ...TWILIO_KEYS].forEach((key) => {
      prev[key] = process.env[key];
    });
    SMS_ENV_KEYS.forEach((key) => delete process.env[key]);
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_ID;
    resetOrangeTokenCache();
  });

  afterEach(() => {
    Object.entries(prev).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    resetOrangeTokenCache();
  });

  test('SMS without phone does not throw', async () => {
    await expect(sendSms(null, 'EduConnect test')).resolves.toMatchObject({ ok: false, reason: 'no_phone' });
  });

  test('Orange uses per-school senderName and CI MSISDN, not the global default only', async () => {
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
    expect(body.outboundSMSMessageRequest.senderName).toBe('SteMarie');
    expect(body.outboundSMSMessageRequest.senderAddress).toBe(CI_SENDER_ADDRESS);
    expect(body.outboundSMSMessageRequest.address).toBe('tel:+2250700000000');
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
    global.fetch = prevFetch;
  });

  test('WhatsApp without token does not throw', async () => {
    await expect(sendWhatsApp('0700000000', 'EduConnect test')).resolves.toMatchObject({
      ok: false,
      reason: 'not_configured',
    });
  });

  test('email without SMTP does not throw', async () => {
    const { sendEmail, smtpConfigured } = require('../src/services/email');
    expect(smtpConfigured()).toBe(false);
    await expect(sendEmail('parent@educonnect-ci.com', {
      subject: 'EduConnect',
      text: 'Bonjour',
    })).resolves.toMatchObject({ ok: false, reason: 'no_smtp', skip: true });
  });

  test('email without recipient does not throw', async () => {
    const { sendEmail } = require('../src/services/email');
    await expect(sendEmail(null, { subject: 'x', text: 'y' })).resolves.toMatchObject({
      ok: false,
      reason: 'no_email',
      skip: true,
    });
  });

  test('web push without VAPID does not throw', async () => {
    const { sendWebPush, vapidEnabled } = require('../src/services/webPush');
    expect(vapidEnabled()).toBe(false);
    await expect(sendWebPush('user-1', { title: 'EduConnect', body: 'Test' })).resolves.toMatchObject({
      ok: false,
      reason: 'no_vapid',
    });
  });
});

describe('Orange SMS HTTP', () => {
  const prev = {};
  let prevFetch;

  beforeEach(() => {
    SMS_ENV_KEYS.forEach((key) => {
      prev[key] = process.env[key];
      delete process.env[key];
    });
    process.env.SMS_PROVIDER = 'orange';
    resetOrangeTokenCache();
    prevFetch = global.fetch;
  });

  afterEach(() => {
    Object.entries(prev).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    global.fetch = prevFetch;
    resetOrangeTokenCache();
  });

  test('fetches an OAuth token then sends the SMS', async () => {
    process.env.ORANGE_SMS_CLIENT_ID = 'client-id';
    process.env.ORANGE_SMS_CLIENT_SECRET = 'client-secret';
    process.env.ORANGE_SMS_TOKEN_URL = 'https://example.test/oauth/token';
    process.env.ORANGE_SMS_URL = 'https://example.test/sms';
    process.env.ORANGE_SMS_SENDER = 'EduConnect';

    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonRes(true, { access_token: 'fresh-access', expires_in: 3600 }, 200))
      .mockResolvedValueOnce(jsonRes(true, { outboundSMSMessageRequest: {} }, 201));

    await expect(sendSms('07 00 00 00 00', 'Bonjour')).resolves.toMatchObject({
      ok: true,
      provider: 'orange',
      sender: 'EduConnect',
      address: 'tel:+2250700000000',
    });

    expect(global.fetch.mock.calls[0][0]).toBe('https://example.test/oauth/token');
    expect(global.fetch.mock.calls[0][1].body).toBe('grant_type=client_credentials');
    const basic = global.fetch.mock.calls[0][1].headers.Authorization.replace(/^Basic\s+/, '');
    expect(Buffer.from(basic, 'base64').toString()).toBe('client-id:client-secret');
    expect(global.fetch.mock.calls[1][0]).toBe('https://example.test/sms');
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-access');
    const sent = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(sent.outboundSMSMessageRequest.address).toBe('tel:+2250700000000');
    expect(sent.outboundSMSMessageRequest.senderName).toBe('EduConnect');
  });

  test('reuses a cached OAuth token on the next send', async () => {
    process.env.ORANGE_SMS_CLIENT_ID = 'client-id';
    process.env.ORANGE_SMS_CLIENT_SECRET = 'client-secret';
    process.env.ORANGE_SMS_TOKEN_URL = 'https://example.test/oauth/token';
    process.env.ORANGE_SMS_URL = 'https://example.test/sms';
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonRes(true, { access_token: 'cached-access', expires_in: 3600 }, 200))
      .mockResolvedValueOnce({ ok: true, status: 201 })
      .mockResolvedValueOnce({ ok: true, status: 201 });

    await sendSms('0700000000', 'un');
    await sendSms('0700000001', 'deux');
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch.mock.calls[0][0]).toBe('https://example.test/oauth/token');
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer cached-access');
    expect(global.fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer cached-access');
  });

  test('defaults match SMS Côte d\'Ivoire v2.0 Client Credentials', () => {
    expect(DEFAULT_TOKEN_URL).toBe('https://api.orange.com/oauth/v3/token');
    expect(CI_SENDER_ADDRESS).toBe('tel:+2250000');
    expect(DEFAULT_SEND_URL).toBe(
      'https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B2250000/requests',
    );
  });

  test('uses the default Orange URLs when only client credentials are set', async () => {
    process.env.ORANGE_SMS_CLIENT_ID = 'client-id';
    process.env.ORANGE_SMS_CLIENT_SECRET = 'client-secret';
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonRes(true, { access_token: 'fresh-access', expires_in: 3600 }, 200))
      .mockResolvedValueOnce({ ok: true, status: 201 });

    await sendSms('+2250700000000', 'Ping');
    expect(global.fetch.mock.calls[0][0]).toBe(DEFAULT_TOKEN_URL);
    expect(global.fetch.mock.calls[1][0]).toBe(DEFAULT_SEND_URL);
  });

  test('skips when Orange is not configured', async () => {
    global.fetch = jest.fn();
    expect(orangeConfigured()).toBe(false);
    await expect(sendSms('0700000000', 'test')).resolves.toMatchObject({
      ok: false,
      reason: 'not_configured',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects a bad number without calling Orange', async () => {
    process.env.ORANGE_SMS_URL = 'https://example.test/sms';
    process.env.ORANGE_SMS_TOKEN = 'token';
    global.fetch = jest.fn();
    await expect(sendSms('12', 'test')).resolves.toMatchObject({
      ok: false,
      reason: 'invalid_phone',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('legacy URL + token still sends with Bearer already in env', async () => {
    process.env.ORANGE_SMS_URL = 'https://example.test/sms';
    process.env.ORANGE_SMS_TOKEN = 'legacy-bearer';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    await expect(sendSms('0700000000', 'legacy')).resolves.toMatchObject({ ok: true, provider: 'orange' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer legacy-bearer');
  });

  test('Orange HTTP error becomes a safe reason without leaking tokens', async () => {
    process.env.ORANGE_SMS_URL = 'https://example.test/sms';
    process.env.ORANGE_SMS_TOKEN = 'super-secret-token-value';
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue(jsonRes(false, {
      message: 'Expired credentials',
      access_token: 'should-not-leak',
    }, 401));

    const result = await sendSms('0700000000', 'test');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Orange HTTP 401/);
    expect(result.reason).toMatch(/Expired credentials/);
    expect(result.reason).not.toMatch(/super-secret-token-value/);
    expect(result.reason).not.toMatch(/should-not-leak/);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/super-secret-token-value/);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/should-not-leak/);
    spy.mockRestore();
  });

  test('connectivity test SMS uses the documented body', async () => {
    process.env.ORANGE_SMS_URL = 'https://example.test/sms';
    process.env.ORANGE_SMS_TOKEN = 'token';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    expect(TEST_SMS_TEXT).toBe('EduConnect : test SMS Orange.');
    await sendConnectivityTestSms('0700000000', { school: { smsSenderId: 'SteMarie' } });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.outboundSMSMessageRequest.outboundSMSTextMessage.message).toBe(TEST_SMS_TEXT);
    expect(body.outboundSMSMessageRequest.senderName).toBe('SteMarie');
  });
});

describe('CI MSISDN', () => {
  test('normalizes local, international and spaced numbers', () => {
    expect(normalizeCiMsisdn('0700000000')).toBe('tel:+2250700000000');
    expect(normalizeCiMsisdn('+225 07 00 00 00 00')).toBe('tel:+2250700000000');
    expect(normalizeCiMsisdn('2250700000000')).toBe('tel:+2250700000000');
    expect(normalizeCiMsisdn('12')).toBeNull();
    expect(normalizeCiMsisdn('abc')).toBeNull();
  });

  test('Twilio To is E.164 +225 without the tel: prefix', () => {
    expect(normalizeCiE164('0700000000')).toBe('+2250700000000');
    expect(normalizeCiE164('+225 07 00 00 00 00')).toBe('+2250700000000');
    expect(normalizeCiE164('12')).toBeNull();
  });
});

describe('Twilio SMS HTTP', () => {
  const prev = {};
  let prevFetch;

  beforeEach(() => {
    SMS_ENV_KEYS.forEach((key) => {
      prev[key] = process.env[key];
      delete process.env[key];
    });
    process.env.SMS_PROVIDER = 'twilio';
    prevFetch = global.fetch;
  });

  afterEach(() => {
    Object.entries(prev).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    global.fetch = prevFetch;
  });

  function setTwilioCreds() {
    process.env.TWILIO_ACCOUNT_SID = 'ACtestaccountsid000000000000000000';
    process.env.TWILIO_AUTH_TOKEN = 'super-secret-twilio-token';
    process.env.TWILIO_PHONE_NUMBER = '+15005550006';
  }

  test('sends a 201 with Basic auth and To=+225…', async () => {
    setTwilioCreds();
    global.fetch = jest.fn().mockResolvedValue(jsonRes(true, { sid: 'SM123', status: 'queued' }, 201));

    await expect(sendSms('0700000000', 'École Sainte Marie : test', { sender: 'SteMarie' })).resolves.toMatchObject({
      ok: true,
      provider: 'twilio',
      sender: 'SteMarie',
      address: '+2250700000000',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe(twilioMessagesUrl('ACtestaccountsid000000000000000000'));
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtestaccountsid000000000000000000/Messages.json');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const basic = opts.headers.Authorization.replace(/^Basic\s+/, '');
    expect(Buffer.from(basic, 'base64').toString()).toBe(
      'ACtestaccountsid000000000000000000:super-secret-twilio-token',
    );
    const form = new URLSearchParams(opts.body);
    expect(form.get('To')).toBe('+2250700000000');
    expect(form.get('To')).not.toMatch(/^tel:/);
    expect(form.get('From')).toBe('+15005550006');
    expect(form.get('Body')).toBe('École Sainte Marie : test');
    expect(form.get('MessagingServiceSid')).toBeNull();
  });

  test('uses Messaging Service SID instead of From when set', async () => {
    setTwilioCreds();
    process.env.TWILIO_MESSAGING_SERVICE_SID = 'MGaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    global.fetch = jest.fn().mockResolvedValue(jsonRes(true, { sid: 'SM456' }, 201));

    await sendSms('0700000000', 'Ping');
    const form = new URLSearchParams(global.fetch.mock.calls[0][1].body);
    expect(form.get('MessagingServiceSid')).toBe('MGaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(form.get('From')).toBeNull();
    expect(form.get('To')).toBe('+2250700000000');
  });

  test('alphanumeric From is used only when TWILIO_ALLOW_ALPHANUMERIC=true', async () => {
    setTwilioCreds();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201 });

    await sendSms('0700000000', 'Ping', { sender: 'SteMarie' });
    expect(new URLSearchParams(global.fetch.mock.calls[0][1].body).get('From')).toBe('+15005550006');

    process.env.TWILIO_ALLOW_ALPHANUMERIC = 'true';
    await sendSms('0700000000', 'Ping', { sender: 'SteMarie' });
    expect(new URLSearchParams(global.fetch.mock.calls[1][1].body).get('From')).toBe('SteMarie');
  });

  test('skips when Twilio is not configured', async () => {
    global.fetch = jest.fn();
    expect(twilioConfigured()).toBe(false);
    expect(smsConfigured()).toBe(false);
    await expect(sendSms('0700000000', 'test')).resolves.toMatchObject({
      ok: false,
      reason: 'not_configured',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('Twilio HTTP error is honest and does not leak the auth token', async () => {
    setTwilioCreds();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue(jsonRes(false, {
      code: 20003,
      message: 'Authenticate',
      auth_token: 'should-not-leak',
    }, 401));

    const result = await sendSms('0700000000', 'test');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Twilio HTTP 401/);
    expect(result.reason).toMatch(/Authenticate/);
    expect(result.reason).not.toMatch(/super-secret-twilio-token/);
    expect(result.reason).not.toMatch(/should-not-leak/);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/super-secret-twilio-token/);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/should-not-leak/);
    spy.mockRestore();
  });

  test('connectivity test SMS uses the Twilio body', async () => {
    setTwilioCreds();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    await sendConnectivityTestSms('0700000000', { school: { smsSenderId: 'SteMarie' } });
    const form = new URLSearchParams(global.fetch.mock.calls[0][1].body);
    expect(form.get('Body')).toBe('EduConnect : test SMS Twilio.');
    expect(form.get('To')).toBe('+2250700000000');
    expect(form.get('From')).toBe('+15005550006');
  });
});
