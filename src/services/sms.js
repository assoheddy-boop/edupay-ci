const { sanitizeSmsSenderId } = require('../utils/officialSms');

const DEFAULT_SENDER = 'EduConnect';
const CI_SENDER_ADDRESS = 'tel:+2250000';
const DEFAULT_TOKEN_URL = 'https://api.orange.com/oauth/v3/token';
const DEFAULT_SEND_URL = `https://api.orange.com/smsmessaging/v1/outbound/${encodeURIComponent(CI_SENDER_ADDRESS)}/requests`;
const TEST_SMS_TEXT = 'EduConnect : test SMS Orange.';
const TOKEN_SKEW_MS = 60_000;

let tokenCache = { token: null, expiresAt: 0 };

function resetOrangeTokenCache() {
  tokenCache = { token: null, expiresAt: 0 };
}

function resolveSender(options = {}) {
  return sanitizeSmsSenderId(options.sender)
    || sanitizeSmsSenderId(process.env.ORANGE_SMS_SENDER)
    || DEFAULT_SENDER;
}

function orangeSenderName(sender) {
  const cleaned = String(sender || DEFAULT_SENDER).replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 11) || DEFAULT_SENDER;
}

function normalizeCiMsisdn(phone) {
  if (phone == null) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00225')) digits = digits.slice(5);
  else if (digits.startsWith('225')) digits = digits.slice(3);
  if (digits.length < 8 || digits.length > 10) return null;
  return `tel:+225${digits}`;
}

function hasOauthCreds() {
  return Boolean(String(process.env.ORANGE_SMS_CLIENT_ID || '').trim()
    && String(process.env.ORANGE_SMS_CLIENT_SECRET || '').trim());
}

function hasLegacyCreds() {
  return Boolean(String(process.env.ORANGE_SMS_URL || '').trim()
    && String(process.env.ORANGE_SMS_TOKEN || '').trim());
}

function orangeConfigured() {
  return hasOauthCreds() || hasLegacyCreds();
}

function redactSecrets(value) {
  return String(value || '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/Basic\s+\S+/gi, 'Basic [redacted]')
    .replace(/access_token"\s*:\s*"[^"]+"/gi, 'access_token":"[redacted]"')
    .replace(/client_secret"\s*:\s*"[^"]+"/gi, 'client_secret":"[redacted]"')
    .slice(0, 180);
}

function safeNetworkReason(err) {
  const message = redactSecrets(err?.message || err || 'orange_network');
  if (!message || /token|secret|bearer|authorization/i.test(message) && /[A-Za-z0-9+/]{20,}/.test(message)) {
    return 'orange_network';
  }
  return message.slice(0, 180) || 'orange_network';
}

function orangeErrorHint(bodyText) {
  try {
    const json = JSON.parse(bodyText);
    return json.message
      || json.description
      || json.requestError?.serviceException?.text
      || json.requestError?.policyException?.text
      || json.requestError?.serviceException?.messageId
      || '';
  } catch {
    return '';
  }
}

function safeOrangeMessage(status, bodyText, kind = 'send') {
  const hint = redactSecrets(orangeErrorHint(bodyText));
  const prefix = kind === 'token' ? 'Orange token HTTP' : 'Orange HTTP';
  const code = status || 'error';
  return hint ? `${prefix} ${code} (${hint})` : `${prefix} ${code}`;
}

async function readResponseText(res) {
  if (typeof res?.text === 'function') return res.text();
  if (typeof res?.json === 'function') {
    try {
      return JSON.stringify(await res.json());
    } catch {
      return '';
    }
  }
  return '';
}

async function fetchOrangeAccessToken() {
  const clientId = String(process.env.ORANGE_SMS_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.ORANGE_SMS_CLIENT_SECRET || '').trim();
  const tokenUrl = String(process.env.ORANGE_SMS_TOKEN_URL || '').trim() || DEFAULT_TOKEN_URL;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });
  const raw = await readResponseText(res);
  if (!res.ok) {
    throw Object.assign(new Error(safeOrangeMessage(res.status, raw, 'token')), { safe: true });
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Orange token invalide'), { safe: true });
  }
  const token = data.access_token;
  if (!token) {
    throw Object.assign(new Error('Orange token manquant'), { safe: true });
  }
  const expiresIn = Number(data.expires_in) || 3600;
  tokenCache = {
    token,
    expiresAt: Date.now() + Math.max(30, expiresIn) * 1000 - TOKEN_SKEW_MS,
  };
  return token;
}

async function getOrangeAccessToken({ force = false } = {}) {
  if (hasOauthCreds()) {
    if (!force && tokenCache.token && Date.now() < tokenCache.expiresAt) {
      return tokenCache.token;
    }
    return fetchOrangeAccessToken();
  }
  const legacy = String(process.env.ORANGE_SMS_TOKEN || '').trim();
  return legacy || null;
}

function orangeSendUrl() {
  return String(process.env.ORANGE_SMS_URL || '').trim() || DEFAULT_SEND_URL;
}

function buildOrangePayload(address, sender, message) {
  return {
    outboundSMSMessageRequest: {
      address,
      senderAddress: CI_SENDER_ADDRESS,
      senderName: orangeSenderName(sender),
      outboundSMSTextMessage: { message },
    },
  };
}

async function postOrangeSms(url, token, payload) {
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function sendOrangeSms(phone, message, sender) {
  if (!orangeConfigured()) {
    console.warn('[SMS] Orange non configuré');
    return { ok: false, reason: 'not_configured', sender };
  }

  const address = normalizeCiMsisdn(phone);
  if (!address) return { ok: false, reason: 'invalid_phone', sender };

  const url = orangeSendUrl();
  const payload = buildOrangePayload(address, sender, message);

  try {
    let token = await getOrangeAccessToken();
    if (!token) {
      console.warn('[SMS] Orange non configuré');
      return { ok: false, reason: 'not_configured', sender };
    }

    let res = await postOrangeSms(url, token, payload);
    if (res.status === 401 && hasOauthCreds()) {
      resetOrangeTokenCache();
      token = await getOrangeAccessToken({ force: true });
      res = await postOrangeSms(url, token, payload);
    }

    if (!res.ok) {
      const raw = await readResponseText(res);
      const reason = safeOrangeMessage(res.status, raw);
      console.error('[SMS Orange]', reason);
      return { ok: false, reason, provider: 'orange', sender };
    }

    return { ok: true, provider: 'orange', sender, address };
  } catch (err) {
    const reason = err?.safe ? err.message : safeNetworkReason(err);
    console.error('[SMS Orange]', reason);
    return { ok: false, reason, provider: 'orange', sender };
  }
}

async function sendSms(phone, message, options = {}) {
  if (!phone) return { ok: false, reason: 'no_phone' };

  const provider = process.env.SMS_PROVIDER || 'console';
  const sender = resolveSender(options);

  if (provider === 'console') {
    console.log(`[SMS ${sender} → ${phone}] ${message}`);
    return { ok: true, provider: 'console', sender };
  }

  if (provider === 'orange') {
    return sendOrangeSms(phone, message, sender);
  }

  // Optional aggregators: same `sender` maps to Twilio `from` / Africa's Talking `from`.
  // Not wired to live accounts — keep ORANGE_* (or SMS_PROVIDER=console) for the HTTP send.
  if (provider === 'twilio' || provider === 'africastalking') {
    console.warn(`[SMS] ${provider} non branché — utilisez SMS_PROVIDER=orange ou console`);
    return { ok: false, reason: 'not_configured', sender };
  }

  return { ok: false, reason: 'unknown_provider' };
}

async function sendConnectivityTestSms(phone, { school } = {}) {
  const { resolveSmsSender } = require('../utils/officialSms');
  const sender = resolveSmsSender({ school });
  return sendSms(phone, TEST_SMS_TEXT, { sender });
}

async function sendWhatsApp(phone, message) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId || !phone) {
    console.log(`[WhatsApp → ${phone || '?'}] ${message}`);
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: `225${phone.replace(/\D/g, '').slice(-10)}`,
        type: 'text',
        text: { body: message },
      }),
    });
    return { ok: res.ok, provider: 'whatsapp' };
  } catch (err) {
    console.error('[WhatsApp]', redactSecrets(err.message));
    return { ok: false, reason: safeNetworkReason(err) };
  }
}

module.exports = {
  sendSms,
  sendWhatsApp,
  sendConnectivityTestSms,
  orangeConfigured,
  normalizeCiMsisdn,
  resetOrangeTokenCache,
  TEST_SMS_TEXT,
  CI_SENDER_ADDRESS,
  DEFAULT_SEND_URL,
  DEFAULT_TOKEN_URL,
};
