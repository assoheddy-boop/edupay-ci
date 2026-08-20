const { Server } = require('socket.io');
const { verifyToken } = require('../utils/jwt');
const prisma = require('../config/database');

let io;

function getAllowedOrigins() {
  const env = process.env.SOCKET_CORS_ORIGIN || process.env.APP_URL || 'http://localhost:3000';
  return env.split(',').map((o) => o.trim()).filter(Boolean);
}

function tokenFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const part = String(cookieHeader).split(';').map((s) => s.trim()).find((s) => s.startsWith('token='));
  if (!part) return null;
  return decodeURIComponent(part.slice('token='.length));
}

function initSocket(httpServer) {
  const origins = getAllowedOrigins();
  io = new Server(httpServer, {
    cors: {
      origin: origins.length === 1 ? origins[0] : origins,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token
      || tokenFromCookie(socket.handshake.headers?.cookie);
    if (!token) return next(new Error('Non authentifié'));
    try {
      const decoded = verifyToken(token);
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!user) return next(new Error('Utilisateur invalide'));
      socket.userId = user.id;
      socket.join(`user:${user.id}`);
      next();
    } catch {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('subscribe', (userId) => {
      if (!userId) return;
      if (socket.userId && String(userId) !== String(socket.userId)) return;
      socket.join(String(userId));
    });

    socket.on('typing', ({ partnerId }) => {
      io.to(`user:${partnerId}`).emit('typing', { from: socket.userId });
    });
  });

  return io;
}

function emitNewMessage(receiverId, message) {
  if (io) io.to(`user:${receiverId}`).emit('new_message', message);
}

function emitCorrespondanceMessage(receiverId, message) {
  emitToUser(receiverId, 'correspondance_message', message);
}

function emitCorrespondanceProjet(userIds, payload) {
  (userIds || []).forEach((uid) => emitToUser(uid, 'correspondance_projet', payload));
}

function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(String(userId)).emit(event, payload);
  io.to(`user:${userId}`).emit(event, payload);
}

function getIo() {
  return io;
}

module.exports = { initSocket, emitNewMessage, emitCorrespondanceMessage, emitCorrespondanceProjet, emitToUser, getIo, tokenFromCookie };
