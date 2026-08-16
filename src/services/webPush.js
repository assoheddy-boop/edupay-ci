function vapidEnabled() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Optional Web Push. VAPID keys are an env foundation only —
 * no PushSubscription store / browser opt-in exists yet.
 */
async function sendWebPush(_userId, _payload) {
  if (!vapidEnabled()) return { ok: false, reason: 'no_vapid' };
  return { ok: false, reason: 'no_subscriptions' };
}

module.exports = { sendWebPush, vapidEnabled };
