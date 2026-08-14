const prisma = require('../src/config/database');

const CONSENT_TYPES = ['DATA_PROCESSING', 'PHOTOS', 'HEALTH', 'MARKETING'];

const CONSENT_LABELS = {
  DATA_PROCESSING: 'Traitement des données personnelles',
  PHOTOS: 'Photos et médias',
  HEALTH: 'Données de santé',
  MARKETING: 'Communications et offres',
};

const CONSENT_HINTS = {
  DATA_PROCESSING: 'Autoriser l\'école à traiter les informations nécessaires au suivi scolaire.',
  PHOTOS: 'Autoriser la publication de photos de vos enfants dans le cadre scolaire.',
  HEALTH: 'Autoriser le partage des signalements de santé avec l\'établissement.',
  MARKETING: 'Recevoir des informations, rappels et offres d\'EduPay CI.',
};

function normalizeType(type) {
  const value = String(type || '').trim().toUpperCase();
  return CONSENT_TYPES.includes(value) ? value : null;
}

function normalizeStatus(action) {
  const value = String(action || '').trim().toUpperCase();
  if (value === 'GRANT' || value === 'GRANTED') return 'GRANTED';
  if (value === 'REVOKE' || value === 'REVOKED') return 'REVOKED';
  return null;
}

async function listConsents(parentId) {
  const existing = await prisma.consent.findMany({
    where: { parentId },
    orderBy: { type: 'asc' },
  });
  const byType = new Map(existing.map((c) => [c.type, c]));
  return CONSENT_TYPES.map((type) => byType.get(type) || {
    id: null,
    parentId,
    type,
    status: 'PENDING',
    createdAt: null,
    updatedAt: null,
  });
}

async function upsertConsent(parentId, type, status) {
  const consentType = normalizeType(type);
  const consentStatus = status === 'GRANTED' || status === 'REVOKED' || status === 'PENDING'
    ? status
    : normalizeStatus(status);
  if (!parentId) return { ok: false, error: 'parent' };
  if (!consentType) return { ok: false, error: 'type' };
  if (!consentStatus) return { ok: false, error: 'status' };

  const consent = await prisma.consent.upsert({
    where: { parentId_type: { parentId, type: consentType } },
    create: { parentId, type: consentType, status: consentStatus },
    update: { status: consentStatus },
  });
  return { ok: true, consent };
}

module.exports = {
  CONSENT_TYPES,
  CONSENT_LABELS,
  CONSENT_HINTS,
  normalizeType,
  normalizeStatus,
  listConsents,
  upsertConsent,
};
