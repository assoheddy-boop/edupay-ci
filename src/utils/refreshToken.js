const crypto = require('crypto');
const prisma = require('../config/database');

const REFRESH_TTL_MS = Number(process.env.JWT_REFRESH_TTL_MS) || 7 * 24 * 60 * 60 * 1000;

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function generateRawToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function createRefreshToken(userId) {
  const raw = generateRawToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt },
  });
  return { raw, expiresAt };
}

async function findValidRefreshToken(raw) {
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;
  return record;
}

async function revokeRefreshToken(raw) {
  if (!raw) return;
  const tokenHash = hashToken(raw);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function revokeUserRefreshTokens(userId) {
  if (!userId) return;
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function rotateRefreshToken(raw) {
  const existing = await findValidRefreshToken(raw);
  if (!existing) return null;
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  const next = await createRefreshToken(existing.userId);
  return { userId: existing.userId, ...next };
}

module.exports = {
  REFRESH_TTL_MS,
  hashToken,
  createRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
  revokeUserRefreshTokens,
  rotateRefreshToken,
};
