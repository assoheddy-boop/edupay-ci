function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

async function sendEmail(to, { subject, text } = {}) {
  try {
    if (!to) return { ok: false, reason: 'no_email', skip: true };
    if (!subject && !text) return { ok: false, reason: 'no_content', skip: true };
    if (!smtpConfigured()) {
      console.log(`[Email skipped → ${to}] ${subject || ''}`);
      return { ok: false, reason: 'no_smtp', skip: true };
    }

    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch {
      console.warn('[Email] SMTP configuré mais nodemailer n\'est pas installé');
      return { ok: false, reason: 'no_mailer', skip: true };
    }

    const port = Number(process.env.SMTP_PORT) || 587;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
        : undefined,
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: subject || 'EduConnect',
      text: text || '',
    });
    return { ok: true, provider: 'smtp' };
  } catch (err) {
    console.error('[Email]', err?.message || err);
    return { ok: false, reason: err?.message || 'send_failed' };
  }
}

module.exports = { sendEmail, smtpConfigured };
