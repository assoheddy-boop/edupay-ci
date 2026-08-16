async function sendSms(phone, message, options = {}) {
  if (!phone) return { ok: false, reason: 'no_phone' };

  const provider = process.env.SMS_PROVIDER || 'console';
  const sender = String(options.sender || process.env.ORANGE_SMS_SENDER || 'EduConnect').trim() || 'EduConnect';

  if (provider === 'console' || process.env.NODE_ENV === 'development') {
    console.log(`[SMS ${sender} → ${phone}] ${message}`);
    return { ok: true, provider: 'console', sender };
  }

  if (provider === 'orange') {
    const url = process.env.ORANGE_SMS_URL;
    const token = process.env.ORANGE_SMS_TOKEN;
    if (!url || !token) {
      console.warn('[SMS] Orange non configuré');
      return { ok: false, reason: 'not_configured' };
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outboundSMSMessageRequest: {
            address: `tel:+225${phone.replace(/\D/g, '').slice(-10)}`,
            senderAddress: sender,
            outboundSMSTextMessage: { message },
          },
        }),
      });
      return { ok: res.ok, provider: 'orange', sender };
    } catch (err) {
      console.error('[SMS Orange]', err.message);
      return { ok: false, reason: err.message };
    }
  }

  // Optional aggregators: same `sender` maps to Twilio `from` / Africa's Talking `from`.
  // Not wired to live accounts — keep ORANGE_* (or SMS_PROVIDER=console) for the HTTP send.
  if (provider === 'twilio' || provider === 'africastalking') {
    console.warn(`[SMS] ${provider} non branché — utilisez SMS_PROVIDER=orange ou console`);
    return { ok: false, reason: 'not_configured', sender };
  }

  return { ok: false, reason: 'unknown_provider' };
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
    console.error('[WhatsApp]', err.message);
    return { ok: false, reason: err.message };
  }
}

module.exports = { sendSms, sendWhatsApp };
