const cron = require('node-cron');
const prisma = require('../config/database');
const { sendSms, sendWhatsApp } = require('../services/sms');

async function paymentRemindersForSchool(schoolId) {
  const today = new Date().getDate();
  const fees = await prisma.feeType.findMany({
    where: { schoolId, isActive: true, dueDay: { lte: today + 3, gte: today } },
    include: { school: true },
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
            createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          },
        },
      },
    });

    for (const student of students) {
      if (student.payments.length > 0) continue;
      for (const ps of student.parents) {
        const user = ps.parent.user;
        const msg = `EduPay CI: Rappel — ${fee.name} (${fee.amount.toLocaleString('fr-FR')} FCFA) pour ${student.firstName}. Échéance: jour ${fee.dueDay}.`;
        await prisma.notification.create({
          data: { userId: user.id, type: 'PAYMENT', title: 'Rappel paiement', body: msg },
        });
        if (user.phone) {
          await sendSms(user.phone, msg);
          await sendWhatsApp(user.phone, msg);
        }
      }
    }
  }
}

async function paymentReminders() {
  const schools = await prisma.school.findMany({ select: { id: true, name: true } });
  for (const school of schools) {
    try {
      await paymentRemindersForSchool(school.id);
      console.log(`[Cron] Rappels paiement — ${school.name}`);
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

  for (const { parent, students } of byParent.values()) {
    const parts = students.map((s) =>
      `${s.firstName}: ${s.grades.length} note(s), ${s.absences.length} absence(s), ${s.homeworks.length} devoir(s), ${s.badges.length} badge(s)`,
    );
    const body = `Résumé semaine — ${parts.join(' | ')}`;
    await prisma.notification.create({
      data: { userId: parent.userId, type: 'GENERAL', title: 'Résumé hebdomadaire', body },
    });
    if (parent.user.phone) await sendSms(parent.user.phone, `EduPay CI: ${body}`);
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

function startCronJobs() {
  if (process.env.DISABLE_CRON === 'true') return;

  cron.schedule('0 8 * * *', paymentReminders);
  cron.schedule('0 9 * * 1', weeklyParentSummary);
  console.log('[Cron] Jobs planifiés (rappels 8h, résumé lundi 9h) — partitionnés par école');
}

module.exports = { startCronJobs, paymentReminders, weeklyParentSummary };
