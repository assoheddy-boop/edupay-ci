const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/database');
const logger = require('./logger');
const { putObject, readMulterBuffer } = require('./StorageService');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const MAX_PROOF_SIZE = 5 * 1024 * 1024;

function inspectProofFile(file) {
  if (!file) return { ok: false, error: 'file' };

  const mime = (file.mimetype || file.mimeType || '').toLowerCase();
  const originalName = file.originalname || file.originalName || file.filename || '';
  const ext = path.extname(originalName).toLowerCase();
  const mimeOk = ALLOWED_MIME_TYPES.has(mime);
  const extOk = ALLOWED_EXTENSIONS.has(ext);

  if (!mimeOk && !extOk) return { ok: false, error: 'mime' };

  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'file' };
  if (size > MAX_PROOF_SIZE) return { ok: false, error: 'size' };

  return { ok: true, mime, ext: ext || (mime === 'application/pdf' ? '.pdf' : '.jpg') };
}

async function readFileBuffer(file) {
  const buffer = await readMulterBuffer(file);
  if (buffer) return buffer;
  throw Object.assign(new Error('Fichier introuvable'), { code: 'file' });
}

function uniqueHash(buffer, studentId) {
  return crypto
    .createHash('sha256')
    .update(buffer)
    .update(String(studentId))
    .update(crypto.randomBytes(16))
    .digest('hex');
}

/**
 * Vérifie le type MIME et la taille, génère un hash unique,
 * sauvegarde (disque local, Vercel Blob ou S3) et enregistre PaymentProof.
 */
async function validateProof(file, studentId) {
  const inspection = inspectProofFile(file);
  if (!inspection.ok) {
    logger.warn('Justificatif de paiement rejeté', { studentId, error: inspection.error });
    return inspection;
  }

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) {
    logger.warn('Justificatif : élève introuvable', { studentId });
    return { ok: false, error: 'student' };
  }

  try {
    const buffer = await readFileBuffer(file);
    if (buffer.length > MAX_PROOF_SIZE) {
      logger.warn('Justificatif trop volumineux', { studentId, size: buffer.length });
      return { ok: false, error: 'size' };
    }

    const hash = uniqueHash(buffer, studentId);
    const filename = `${hash}${inspection.ext}`;
    const stored = await putObject({
      folder: 'payments',
      filename,
      buffer,
      contentType: inspection.mime || file.mimetype,
    });

    if (file.path) {
      await fs.promises.unlink(file.path).catch(() => {});
    }

    const fileUrl = stored.url;
    const proof = await prisma.paymentProof.create({
      data: {
        hash,
        fileUrl,
        mimeType: inspection.mime || file.mimetype,
        size: buffer.length,
        originalName: file.originalname || file.originalName || null,
        studentId,
      },
    });

    logger.info('Justificatif de paiement enregistré', { studentId, proofId: proof.id, hash });
    return { ok: true, proof, fileUrl, hash };
  } catch (err) {
    logger.error('Erreur enregistrement justificatif', { studentId, message: err.message, stack: err.stack });
    return { ok: false, error: 'file' };
  }
}

async function getPendingPayments(schoolId) {
  const payments = await prisma.payment.findMany({
    where: {
      status: 'PENDING',
      student: { schoolId },
    },
    include: {
      student: { include: { class: true } },
      feeType: true,
      proofs: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  logger.info('Paiements en attente chargés', { schoolId, count: payments.length });
  return payments;
}

module.exports = {
  validateProof,
  getPendingPayments,
  inspectProofFile,
  ALLOWED_MIME_TYPES,
  MAX_PROOF_SIZE,
};
