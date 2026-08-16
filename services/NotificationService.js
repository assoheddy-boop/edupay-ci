const prisma = require('../src/config/database');
const { getIo } = require('../src/config/socket');
const { sendSms, sendWhatsApp } = require('../src/services/sms');

const NOTIFICATION_TYPES = {
  payment_validated: { prisma: 'PAYMENT', title: 'Paiement validé', sms: true },
  absence_reported: { prisma: 'ABSENCE', title: 'Absence signalée', sms: true },
  late_reported: { prisma: 'LATE', title: 'Retard signalé', sms: true },
  new_homework: { prisma: 'HOMEWORK', title: 'Nouveau devoir', sms: false },
  new_message: { prisma: 'GENERAL', title: 'Nouveau message', sms: false },
  payment_overdue: { prisma: 'PAYMENT', title: 'Paiement en retard', sms: true },
  transfer_requested: { prisma: 'TRANSFER', title: 'Demande de transfert', sms: false },
  transfer_approved: { prisma: 'TRANSFER', title: 'Transfert approuvé', sms: false },
  transfer_rejected: { prisma: 'TRANSFER', title: 'Transfert refusé', sms: false },
  transfer_completed: { prisma: 'TRANSFER', title: 'Transfert terminé', sms: false },
  timetable_updated: { prisma: 'GENERAL', title: 'Emploi du temps', sms: true },
};

function assertType(type) {
  return NOTIFICATION_TYPES[type] || null;
}

async function sendNotification(userId, type, message) {
  const meta = assertType(type);
  if (!userId || !message) {
    return { ok: false, error: 'data' };
  }
  if (!meta) {
    return { ok: false, error: 'type' };
  }

  const notification = await prisma.notification.create({
    data: {
      userId,
      type: meta.prisma,
      title: meta.title,
      body: message,
    },
  });

  const io = getIo();
  if (io) {
    const payload = {
      id: notification.id,
      type,
      title: meta.title,
      message,
      createdAt: notification.createdAt,
    };
    io.to(String(userId)).emit('notification', payload);
    io.to(`user:${userId}`).emit('notification', payload);
  }

  if (meta.sms) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.phone) {
      const text = `EduConnect: ${meta.title} — ${message}`;
      await sendSms(user.phone, text);
      await sendWhatsApp(user.phone, text);
    }
  }

  return { ok: true, notification };
}

module.exports = {
  sendNotification,
  NOTIFICATION_TYPES,
};
