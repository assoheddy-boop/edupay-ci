const prisma = require('../config/database');
const { sendSms, sendWhatsApp } = require('../services/sms');

const CRITICAL_SMS_TYPES = ['HEALTH', 'TRANSPORT', 'ABSENCE', 'LATE'];

async function notifyUser(userId, { type, title, body, sms = false }) {
  await prisma.notification.create({
    data: { userId, type, title, body },
  });

  const shouldSms = sms || CRITICAL_SMS_TYPES.includes(type);
  if (shouldSms) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.phone) {
      await sendSms(user.phone, `EduConnect: ${title} — ${body}`);
      await sendWhatsApp(user.phone, `EduConnect: ${title} — ${body}`);
    }
  }
}

async function notifyStudentParents(studentId, { type, title, body, sms = false }) {
  const links = await prisma.parentStudent.findMany({
    where: { studentId },
    include: { parent: { include: { user: true } } },
  });

  const shouldSms = sms || CRITICAL_SMS_TYPES.includes(type);

  await Promise.all(
    links.map(async (link) => {
      await notifyUser(link.parent.userId, { type, title, body, sms: shouldSms });
    }),
  );
}

const TRANSPORT_LABELS = {
  BOARDED_BUS: 'Monté dans le bus',
  ARRIVED_SCHOOL: 'Arrivé à l\'école',
  LEFT_SCHOOL: 'Sorti de l\'école',
  PICKED_UP: 'Récupéré',
};

const BADGE_PRESETS = [
  { type: 'PONCTUALITE', label: 'Ponctualité' },
  { type: 'COMPORTEMENT', label: 'Bon comportement' },
  { type: 'PROPRETE', label: 'Propreté' },
  { type: 'TRAVAIL', label: 'Travail bien fait' },
  { type: 'PARTICIPATION', label: 'Participation' },
];

module.exports = {
  notifyUser,
  notifyStudentParents,
  TRANSPORT_LABELS,
  BADGE_PRESETS,
  CRITICAL_SMS_TYPES,
};
