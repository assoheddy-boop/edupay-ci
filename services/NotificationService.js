const prisma = require('../src/config/database');
const { emitToUser } = require('../src/config/socket');
const { sendSms, sendWhatsApp } = require('../src/services/sms');
const { sendWebPush } = require('../src/services/webPush');
const { sendEmail } = require('../src/services/email');
const { allowsMarketingMessages } = require('./ConsentService');

const CHANNELS = {
  IN_APP: 'IN_APP',
  SMS: 'SMS',
  EMAIL: 'EMAIL',
  PUSH: 'PUSH',
};

const MAX_ATTEMPTS = 3;
const CRITICAL_EVENTS = new Set([
  'ABSENCE',
  'LATE',
  'PAYMENT_VALIDATED',
  'PAYMENT_REFUSED',
]);

const SKIP_REASONS = new Set([
  'no_phone',
  'no_email',
  'no_smtp',
  'no_mailer',
  'no_vapid',
  'no_subscriptions',
  'not_configured',
  'consent_revoked',
  'no_content',
]);

const NOTIFICATION_TYPES = {
  payment_validated: {
    prisma: 'PAYMENT',
    title: 'Paiement validé',
    eventType: 'PAYMENT_VALIDATED',
    sms: true,
  },
  payment_refused: {
    prisma: 'PAYMENT',
    title: 'Paiement refusé',
    eventType: 'PAYMENT_REFUSED',
    sms: true,
  },
  absence_reported: {
    prisma: 'ABSENCE',
    title: 'Absence signalée',
    eventType: 'ABSENCE',
    sms: true,
  },
  late_reported: {
    prisma: 'LATE',
    title: 'Retard signalé',
    eventType: 'LATE',
    sms: true,
  },
  new_homework: {
    prisma: 'HOMEWORK',
    title: 'Nouveau devoir',
    eventType: 'HOMEWORK_PUBLISHED',
    sms: true,
  },
  homework_reminder: {
    prisma: 'HOMEWORK',
    title: 'Rappel devoir',
    eventType: 'HOMEWORK_REMIND',
    sms: true,
  },
  new_message: {
    prisma: 'GENERAL',
    title: 'Nouveau message',
    eventType: 'MESSAGE',
    sms: false,
  },
  payment_overdue: {
    prisma: 'PAYMENT',
    title: 'Paiement en retard',
    eventType: 'PAYMENT_OVERDUE',
    sms: true,
  },
  transfer_requested: {
    prisma: 'TRANSFER',
    title: 'Demande de transfert',
    eventType: 'TRANSFER_REQUESTED',
    sms: false,
  },
  transfer_approved: {
    prisma: 'TRANSFER',
    title: 'Transfert approuvé',
    eventType: 'TRANSFER_APPROVED',
    sms: false,
  },
  transfer_rejected: {
    prisma: 'TRANSFER',
    title: 'Transfert refusé',
    eventType: 'TRANSFER_REJECTED',
    sms: false,
  },
  transfer_completed: {
    prisma: 'TRANSFER',
    title: 'Transfert terminé',
    eventType: 'TRANSFER_COMPLETED',
    sms: false,
  },
  timetable_updated: {
    prisma: 'GENERAL',
    title: 'Emploi du temps',
    eventType: 'TIMETABLE_UPDATED',
    sms: true,
  },
};

function assertType(type) {
  return NOTIFICATION_TYPES[type] || null;
}

function channelsFor(meta) {
  const list = [CHANNELS.IN_APP];
  if (meta?.sms) list.push(CHANNELS.SMS);
  list.push(CHANNELS.EMAIL, CHANNELS.PUSH);
  return list;
}

function appUrl() {
  return process.env.APP_URL || 'https://educonnect-ci.com';
}

function clipError(value) {
  return String(value || '').slice(0, 500) || null;
}

function shouldKickWorker() {
  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.JEST_WORKER_ID) return false;
  return true;
}

function kickWorker() {
  if (!shouldKickWorker()) return;
  if (kickWorker.running) return;
  setImmediate(() => {
    kickWorker.running = true;
    processPendingJobs({ limit: 25 })
      .catch((err) => console.error('[Notify] worker:', err?.message || err))
      .finally(() => {
        kickWorker.running = false;
      });
  });
}

async function enqueue({ userId, schoolId = null, eventType, payload = {}, channels } = {}) {
  if (!userId) return { ok: false, error: 'data' };
  const meta = Object.values(NOTIFICATION_TYPES).find((item) => item.eventType === eventType);
  if (!eventType || (!meta && !channels)) return { ok: false, error: 'type' };

  const body = payload.body || payload.message;
  if (!body) return { ok: false, error: 'data' };

  const list = channels || channelsFor(meta);
  const jobPayload = {
    ...payload,
    title: payload.title || meta?.title || 'EduConnect',
    body,
    prismaType: payload.prismaType || meta?.prisma || 'GENERAL',
    type: payload.type || eventType,
  };

  const jobs = [];
  for (const channel of list) {
    const job = await prisma.notificationJob.create({
      data: {
        userId,
        schoolId: schoolId || null,
        channel,
        eventType,
        payload: jobPayload,
        status: 'pending',
      },
    });
    jobs.push(job);
  }

  for (const job of jobs.filter((row) => row.channel === CHANNELS.IN_APP)) {
    await processJob(job);
  }

  kickWorker();
  return { ok: true, jobs };
}

async function sendNotification(userId, type, message) {
  const meta = assertType(type);
  if (!userId || !message) {
    return { ok: false, error: 'data' };
  }
  if (!meta) {
    return { ok: false, error: 'type' };
  }

  try {
    return await enqueue({
      userId,
      eventType: meta.eventType,
      payload: {
        type,
        title: meta.title,
        body: message,
        prismaType: meta.prisma,
      },
    });
  } catch (err) {
    console.error('[Notify] enqueue failed:', err?.message || err);
    return { ok: false, error: 'enqueue' };
  }
}

async function outboundAllowed(job) {
  if (job.channel === CHANNELS.IN_APP) return true;
  if (CRITICAL_EVENTS.has(job.eventType)) return true;
  return allowsMarketingMessages(job.userId);
}

async function deliver(job) {
  const payload = job.payload || {};
  const title = payload.title || 'EduConnect';
  const body = payload.body || payload.message || '';
  const text = `EduConnect: ${title} — ${body}`;

  if (job.channel === CHANNELS.IN_APP) {
    const notification = await prisma.notification.create({
      data: {
        userId: job.userId,
        type: payload.prismaType || 'GENERAL',
        title,
        body,
      },
    });
    const socketPayload = {
      id: notification.id,
      type: payload.type || job.eventType,
      title,
      message: body,
      createdAt: notification.createdAt,
    };
    try {
      emitToUser(job.userId, 'notification', socketPayload);
    } catch { /* socket optional */ }
    return { ok: true };
  }

  if (!(await outboundAllowed(job))) {
    return { ok: false, reason: 'consent_revoked', skip: true };
  }

  const user = await prisma.user.findUnique({ where: { id: job.userId } });

  if (job.channel === CHANNELS.SMS) {
    if (!user?.phone) return { ok: false, reason: 'no_phone', skip: true };
    const result = await sendSms(user.phone, text);
    await sendWhatsApp(user.phone, text).catch(() => ({ ok: false }));
    if (result.ok) return result;
    if (SKIP_REASONS.has(result.reason)) return { ...result, skip: true };
    return result;
  }

  if (job.channel === CHANNELS.EMAIL) {
    if (!user?.email) return { ok: false, reason: 'no_email', skip: true };
    const result = await sendEmail(user.email, {
      subject: `EduConnect — ${title}`,
      text: `${title}\n\n${body}\n\n${appUrl()}`,
    });
    if (result.ok) return result;
    if (result.skip || SKIP_REASONS.has(result.reason)) return { ...result, skip: true };
    return result;
  }

  if (job.channel === CHANNELS.PUSH) {
    const result = await sendWebPush(job.userId, { title, body, type: payload.type || job.eventType });
    if (result.ok) return result;
    if (result.skip || SKIP_REASONS.has(result.reason)) return { ...result, skip: true };
    return result;
  }

  return { ok: false, reason: 'unknown_channel', skip: true };
}

async function processJob(job) {
  const claimed = await prisma.notificationJob.updateMany({
    where: {
      id: job.id,
      status: { in: ['pending', 'error'] },
    },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return { status: 'skipped', reason: 'claimed' };

  try {
    const outcome = await deliver(job);
    const status = outcome.ok ? 'sent' : (outcome.skip ? 'skipped' : 'error');
    await prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        status,
        error: outcome.ok ? null : clipError(outcome.reason),
        sentAt: outcome.ok ? new Date() : null,
      },
    });
    return { status, reason: outcome.reason || null };
  } catch (err) {
    await prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        status: 'error',
        error: clipError(err?.message || err),
      },
    });
    return { status: 'error', reason: err?.message || 'failed' };
  }
}

async function processPendingJobs({ limit = 40, now = new Date() } = {}) {
  if (!prisma.notificationJob?.findMany) {
    return { ok: false, reason: 'no_model', scanned: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const jobs = await prisma.notificationJob.findMany({
    where: {
      scheduledAt: { lte: now },
      OR: [
        { status: 'pending' },
        { status: 'error', attempts: { lt: MAX_ATTEMPTS } },
      ],
    },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
  });

  const result = { ok: true, scanned: jobs.length, sent: 0, skipped: 0, failed: 0 };
  for (const job of jobs) {
    const outcome = await processJob(job);
    if (outcome.status === 'sent') result.sent += 1;
    else if (outcome.status === 'skipped') result.skipped += 1;
    else result.failed += 1;
  }
  return result;
}

module.exports = {
  sendNotification,
  enqueue,
  processPendingJobs,
  processJob,
  kickWorker,
  NOTIFICATION_TYPES,
  CHANNELS,
  MAX_ATTEMPTS,
  CRITICAL_EVENTS,
};
