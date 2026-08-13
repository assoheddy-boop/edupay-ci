const prisma = require('../src/config/database');
const { getIo } = require('../src/config/socket');
const { sendSms, sendWhatsApp } = require('../src/services/sms');

const NOTIFICATION_TYPES = {
  payment_validated: { prisma: 'PAYMENT', title: 'Paiement validé', sms: true },
  absence_reported: { prisma: 'ABSENCE', title: 'Absence signalée', sms: true },
  new_homework: { prisma: 'HOMEWORK', title: 'Nouveau devoir', sms: false },
  payment_overdue: { prisma: 'PAYMENT', title: 'Paiement en retard', sms: true },
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
      const text = `EduPay CI: ${meta.title} — ${message}`;
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
