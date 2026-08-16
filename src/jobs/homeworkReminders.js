const prisma = require('../config/database');
const { sendNotification } = require('../../services/NotificationService');
const {
  reminderQuery,
  isEligibleForReminder,
  parentReminderMessage,
} = require('../services/homeworkService');

async function notifyHomeworkParents(homework, type, messageFn) {
  const students = homework.class?.students || [];
  let count = 0;
  for (const student of students) {
    for (const ps of student.parents || []) {
      const userId = ps.parent?.userId;
      if (!userId) continue;
      await sendNotification(
        userId,
        type,
        messageFn({
          kind: homework.kind,
          subject: homework.subject,
          title: homework.title,
          dueDate: homework.dueDate,
          studentName: student.firstName,
        }),
      );
      count += 1;
    }
  }
  return count;
}

async function homeworkReminders({ now = new Date() } = {}) {
  const rows = await prisma.homework.findMany({
    where: reminderQuery(now),
    include: {
      class: {
        include: {
          students: {
            include: { parents: { include: { parent: true } } },
          },
        },
      },
    },
  });

  let sent = 0;
  let skipped = 0;
  for (const homework of rows) {
    if (!isEligibleForReminder(homework, now)) {
      skipped += 1;
      continue;
    }

    const claimed = await prisma.homework.updateMany({
      where: { id: homework.id, remindedAt: null },
      data: { remindedAt: now },
    });
    if (claimed.count === 0) {
      skipped += 1;
      continue;
    }

    await notifyHomeworkParents(homework, 'homework_reminder', parentReminderMessage);
    sent += 1;
  }

  return { ok: true, sent, skipped, scanned: rows.length };
}

module.exports = { homeworkReminders, notifyHomeworkParents };
