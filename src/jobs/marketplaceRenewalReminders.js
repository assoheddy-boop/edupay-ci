const prisma = require('../config/database');
const { sendEmail } = require('../services/email');
const { isLiveTier, parseMarketplaceTier } = require('../utils/marketplaceAddon');
const {
  marketplaceSubscriptionStatus,
  RENEWAL_WARNING_DAYS,
} = require('../utils/marketplaceSubscription');
const {
  marketplaceRenewalEmailText,
  marketplaceRenewalEmailSubject,
} = require('../utils/marketplaceRenewalEmail');

const REMINDER_COOLDOWN_DAYS = 25;

function reminderCooldownExpired(lastSent) {
  if (!lastSent) return true;
  const d = lastSent instanceof Date ? lastSent : new Date(lastSent);
  if (Number.isNaN(d.getTime())) return true;
  const ms = Date.now() - d.getTime();
  return ms >= REMINDER_COOLDOWN_DAYS * 86400000;
}

async function findExpiringSchoolsForReminder() {
  const schools = await prisma.school.findMany({
    where: {
      marketplaceTier: { in: ['STANDARD', 'PREMIUM', 'VIP'] },
      marketplaceExpiresAt: { not: null },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      marketplaceTier: true,
      marketplaceExpiresAt: true,
      marketplaceRenewalReminderAt: true,
      admin: { select: { email: true, firstName: true, lastName: true } },
    },
  });
  return schools.filter((school) => {
    if (!isLiveTier(parseMarketplaceTier(school.marketplaceTier))) return false;
    const status = marketplaceSubscriptionStatus(school);
    if (status.state !== 'expiring') return false;
    return reminderCooldownExpired(school.marketplaceRenewalReminderAt);
  });
}

async function sendMarketplaceRenewalReminder(school) {
  const status = marketplaceSubscriptionStatus(school);
  const to = school?.admin?.email;
  if (!to) {
    return { ok: false, schoolId: school.id, reason: 'no_admin_email' };
  }
  const subject = marketplaceRenewalEmailSubject(school);
  const text = marketplaceRenewalEmailText(school, { daysLeft: status.daysLeft });
  const result = await sendEmail(to, { subject, text });
  if (result.ok) {
    await prisma.school.update({
      where: { id: school.id },
      data: { marketplaceRenewalReminderAt: new Date() },
    });
  }
  return {
    ok: Boolean(result.ok),
    schoolId: school.id,
    email: to,
    skip: Boolean(result.skip),
    reason: result.reason || null,
  };
}

async function marketplaceRenewalReminders() {
  const schools = await findExpiringSchoolsForReminder();
  const results = [];
  for (const school of schools) {
    try {
      results.push(await sendMarketplaceRenewalReminder(school));
    } catch (err) {
      results.push({
        ok: false,
        schoolId: school.id,
        reason: err?.message || 'send_failed',
      });
    }
  }
  const sent = results.filter((r) => r.ok).length;
  const skipped = results.filter((r) => r.skip).length;
  const failed = results.filter((r) => !r.ok && !r.skip).length;
  console.log(`[Cron] Marketplace J-${RENEWAL_WARNING_DAYS} — ${sent} envoyé(s), ${skipped} ignoré(s), ${failed} échec(s)`);
  return { scanned: schools.length, sent, skipped, failed, results };
}

module.exports = {
  REMINDER_COOLDOWN_DAYS,
  reminderCooldownExpired,
  findExpiringSchoolsForReminder,
  sendMarketplaceRenewalReminder,
  marketplaceRenewalReminders,
};
