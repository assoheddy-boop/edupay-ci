const prisma = require('../config/database');

async function attachUnreadNotifications(req, res, next) {
  res.locals.unreadNotifications = 0;
  try {
    if (req.user?.id) {
      res.locals.unreadNotifications = await prisma.notification.count({
        where: { userId: req.user.id, readAt: null },
      });
    }
  } catch (err) {
    console.error('[notify] unread count:', err?.message || err);
  }
  next();
}

module.exports = { attachUnreadNotifications };
