const prisma = require('../config/database');
const {
  getPartnersForUser,
  canMessage,
  getConversation,
  markConversationRead,
  countUnread,
} = require('../utils/conversations');

function basePathForRole(role) {
  const map = {
    SCHOOL_ADMIN: '/school',
    PARENT: '/parent',
    TEACHER: '/teacher',
  };
  return map[role] || '/';
}

async function inbox(req, res) {
  const basePath = basePathForRole(req.user.role);
  const partners = await getPartnersForUser(req.user);
  const unread = await countUnread(req.user.id);

  const partnersWithPreview = await Promise.all(
    partners.map(async (p) => {
      const last = await prisma.message.findFirst({
        where: {
          OR: [
            { senderId: req.user.id, receiverId: p.user.id },
            { senderId: p.user.id, receiverId: req.user.id },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
      const unreadCount = await prisma.message.count({
        where: { senderId: p.user.id, receiverId: req.user.id, readAt: null },
      });
      return { ...p, lastMessage: last, unreadCount };
    }),
  );

  partnersWithPreview.sort((a, b) => {
    const da = a.lastMessage?.createdAt || 0;
    const db = b.lastMessage?.createdAt || 0;
    return new Date(db) - new Date(da);
  });

  res.render('messages/inbox', {
    user: req.user,
    basePath,
    partners: partnersWithPreview,
    unread,
  });
}

async function chat(req, res) {
  const { partnerId } = req.params;
  const basePath = basePathForRole(req.user.role);

  if (!(await canMessage(req.user, partnerId))) {
    return res.status(403).render('error', { message: 'Conversation non autorisée', user: req.user });
  }

  const partner = await prisma.user.findUnique({ where: { id: partnerId } });
  if (!partner) return res.redirect(`${basePath}/messages`);

  await markConversationRead(req.user.id, partnerId);
  const messages = await getConversation(req.user.id, partnerId);
  const partners = await getPartnersForUser(req.user);
  const partnerInfo = partners.find((p) => p.user.id === partnerId);
  const { signToken } = require('../utils/jwt');

  let students = [];
  if (req.user.role === 'PARENT' && req.user.parentProfile) {
    students = partnerInfo?.students || [];
  } else if (req.user.role === 'SCHOOL_ADMIN' || req.user.role === 'TEACHER') {
    students = partnerInfo?.students || [];
  }

  res.render('messages/chat', {
    user: req.user,
    basePath,
    partner,
    partnerInfo,
    messages,
    students,
    socketToken: signToken({ userId: req.user.id }, { expiresIn: '12h' }),
    error: null,
  });
}

async function send(req, res) {
  const { partnerId } = req.params;
  const basePath = basePathForRole(req.user.role);
  const { content, studentId } = req.body;
  const uploaded = req.files?.attachment?.[0] || req.files?.audio?.[0] || req.file || null;

  let audioUrl = null;
  let fileUrl = null;
  let fileName = null;
  if (uploaded) {
    const url = uploaded.url || `/uploads/chat/${uploaded.filename}`;
    const isAudio = (uploaded.mimetype || '').startsWith('audio/')
      || /\.(mp3|wav|m4a|ogg)$/i.test(uploaded.originalname || '');
    if (isAudio) {
      audioUrl = url;
    } else {
      fileUrl = url;
      fileName = uploaded.originalname || 'fichier';
    }
  }

  if (!(await canMessage(req.user, partnerId))) {
    return res.status(403).render('error', { message: 'Conversation non autorisée', user: req.user });
  }

  if (!content && !audioUrl && !fileUrl) {
    return res.redirect(`${basePath}/messages/${partnerId}?error=empty`);
  }

  const message = await prisma.message.create({
    data: {
      senderId: req.user.id,
      receiverId: partnerId,
      content: content || null,
      audioUrl,
      fileUrl,
      fileName,
      studentId: studentId || null,
    },
    include: {
      sender: { select: { firstName: true, lastName: true } },
      student: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const { sendNotification } = require('../../services/NotificationService');
  const preview = content
    ? `${req.user.firstName} : ${content.slice(0, 80)}${content.length > 80 ? '…' : ''}`
    : audioUrl
      ? `${req.user.firstName} vous a envoyé un message vocal.`
      : `${req.user.firstName} vous a envoyé un fichier${fileName ? ` (${fileName})` : ''}.`;
  await sendNotification(partnerId, 'new_message', preview).catch(async () => {
    const { notifyUser } = require('../utils/notify');
    await notifyUser(partnerId, { type: 'GENERAL', title: 'Nouveau message', body: preview });
  });

  try {
    const { emitNewMessage } = require('../config/socket');
    emitNewMessage(partnerId, message);
  } catch { /* socket optional */ }

  if (req.headers['x-requested-with'] === 'XMLHttpRequest' || req.query.ajax === '1') {
    return res.json({ ok: true, message });
  }

  res.redirect(`${basePath}/messages/${partnerId}`);
}

module.exports = { inbox, chat, send };
