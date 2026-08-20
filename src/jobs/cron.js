const cron = require('node-cron');
const prisma = require('../config/database');
const { sendSms } = require('../services/sms');
const { sendNotification, processPendingJobs } = require('../../services/NotificationService');
const { homeworkReminders } = require('./homeworkReminders');

async function overduePaymentsForSchool(schoolId) {
  const now = new Date();
  const day = now.getDate();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { adminId: true, name: true },
  });

  const fees = await prisma.feeType.findMany({
    where: { schoolId, isActive: true, dueDay: { not: null, lt: day } },
  });

  for (const fee of fees) {
    const students = await prisma.student.findMany({
      where: { schoolId },
      include: {
        parents: { include: { parent: { include: { user: true } } } },
        payments: {
          where: {
            feeTypeId: fee.id,
            status: 'VALIDATED',
            createdAt: { gte: monthStart },
          },
        },
      },
    });

    for (const student of students) {
      if (student.payments.length > 0) continue;
      const message = `Paiement en retard : ${fee.name} (${fee.amount.toLocaleString('fr-FR')} FCFA) pour ${student.firstName}. Échéance dépassée (jour ${fee.dueDay}).`;
      for (const ps of student.parents) {
        await sendNotification(ps.parent.userId, 'payment_overdue', message, { schoolId });
      }
      if (school?.adminId) {
        await sendNotification(school.adminId, 'payment_overdue', `${student.firstName} ${student.lastName} — ${fee.name} en retard.`, { schoolId });
      }
    }
  }
}

async function paymentReminders() {
  const schools = await prisma.school.findMany({ select: { id: true, name: true } });
  for (const school of schools) {
    try {
      await overduePaymentsForSchool(school.id);
      console.log(`[Cron] Paiements en retard — ${school.name}`);
    } catch (err) {
      console.error(`[Cron] Erreur rappels ${school.id}:`, err.message);
    }
  }
}

async function weeklyParentSummaryForSchool(schoolId) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const links = await prisma.parentStudent.findMany({
    where: { student: { schoolId } },
    include: {
      parent: { include: { user: true } },
      student: {
        include: {
          grades: { where: { createdAt: { gte: weekAgo } } },
          absences: { where: { createdAt: { gte: weekAgo } } },
          homeworks: { where: { homework: { createdAt: { gte: weekAgo } } } },
          badges: { where: { awardedAt: { gte: weekAgo } } },
        },
      },
    },
  });

  const byParent = new Map();
  for (const link of links) {
    if (!byParent.has(link.parentId)) {
      byParent.set(link.parentId, { parent: link.parent, students: [] });
    }
    byParent.get(link.parentId).students.push(link.student);
  }

  const { getModuleMap, isEnabled } = require('../utils/modules');
  const { prefixSmsBody, resolveSmsSender, SMS_OFFICIAL_MODULE } = require('../utils/officialSms');
  const mods = await getModuleMap(schoolId);
  const smsOn = isEnabled(mods, SMS_OFFICIAL_MODULE);
  const schoolRow = smsOn
    ? await prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true, smsSenderId: true },
    })
    : null;

  for (const { parent, students } of byParent.values()) {
    const parts = students.map((s) =>
      `${s.firstName}: ${s.grades.length} note(s), ${s.absences.length} absence(s), ${s.homeworks.length} devoir(s), ${s.badges.length} badge(s)`,
    );
    const body = `Résumé semaine — ${parts.join(' | ')}`;
    await prisma.notification.create({
      data: { userId: parent.userId, type: 'GENERAL', title: 'Résumé hebdomadaire', body },
    });
    if (parent.user.phone && smsOn) {
      await sendSms(
        parent.user.phone,
        prefixSmsBody(schoolRow?.name, body),
        { sender: resolveSmsSender({ school: schoolRow }) },
      );
    }
  }
}

async function weeklyParentSummary() {
  const schools = await prisma.school.findMany({ select: { id: true, name: true } });
  for (const school of schools) {
    try {
      await weeklyParentSummaryForSchool(school.id);
      console.log(`[Cron] Résumé hebdo — ${school.name}`);
    } catch (err) {
      console.error(`[Cron] Erreur résumé ${school.id}:`, err.message);
    }
  }
}

async function dailyBackup() {
  const { dailyDatabaseBackup } = require('../../services/BackupService');
  try {
    await dailyDatabaseBackup();
  } catch (err) {
    console.error('[Cron] Sauvegarde échouée:', err.message);
  }
}

function startCronJobs() {
  if (process.env.DISABLE_CRON === 'true') return;
  if (process.env.VERCEL) {
    console.log('[Cron] Vercel — jobs HTTP /api/internal/cron/*');
    return;
  }

  cron.schedule('0 8 * * *', paymentReminders, { timezone: 'Africa/Abidjan' });
  cron.schedule('0 8 * * *', homeworkReminders, { timezone: 'Africa/Abidjan' });
  cron.schedule('0 18 * * *', homeworkReminders, { timezone: 'Africa/Abidjan' });
  cron.schedule('0 9 * * 1', weeklyParentSummary, { timezone: 'Africa/Abidjan' });
  cron.schedule('0 2 * * *', dailyBackup, { timezone: 'Africa/Abidjan' });
  cron.schedule('* * * * *', () => {
    processPendingJobs().catch((err) => console.error('[Cron] notifications:', err?.message || err));
  }, { timezone: 'Africa/Abidjan' });
  console.log('[Cron] Jobs planifiés (paiements 8h, rappels devoirs 8h+18h, résumé lundi 9h, sauvegarde 2h, file notifications 1 min, Abidjan)');
}

async function notificationJobs() {
  return processPendingJobs();
}

async function hrLeaveMaintenance() {
  const { processExpiredLeaves } = require('../services/hrLeaveService');
  return processExpiredLeaves();
}

module.exports = {
  startCronJobs,
  paymentReminders,
  weeklyParentSummary,
  dailyBackup,
  homeworkReminders,
  notificationJobs,
  hrLeaveMaintenance,
};
