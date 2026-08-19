const prisma = require('../config/database');
const { inspectProofFile } = require('../../services/PaymentService');
const { storeMulterFile } = require('../../services/StorageService');
const { sendNotification } = require('../../services/NotificationService');

const STATUS = {
  NONE: 'NONE',
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REFUSED: 'REFUSED',
};

const STATUS_LABELS = {
  NONE: 'Non justifiée',
  PENDING: 'En attente',
  ACCEPTED: 'Accepté',
  REFUSED: 'Refusé',
};

function forbidden() {
  return { ok: false, error: 'forbidden', status: 403 };
}

function typeLabel(type) {
  return String(type || '').toUpperCase() === 'LATE' ? 'Retard' : 'Absence';
}

function statusLabel(value) {
  const key = String(value || STATUS.NONE).toUpperCase();
  return STATUS_LABELS[key] || STATUS_LABELS.NONE;
}

function parseAction(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'accept' || v === 'accepter' || v === 'approve' || v === 'valider') return STATUS.ACCEPTED;
  if (v === 'refuse' || v === 'refuser' || v === 'reject' || v === 'rejeter') return STATUS.REFUSED;
  return null;
}

function schoolIdOf(student) {
  return student?.schoolId || student?.class?.schoolId || null;
}

async function storeProof(file) {
  if (!file) return { ok: true, fileUrl: null, mimeType: null, originalName: null };
  const inspection = inspectProofFile(file);
  if (!inspection.ok) return { ok: false, error: inspection.error };
  let url = file.url || null;
  if (!url) {
    const stored = await storeMulterFile(file, 'justificatifs');
    url = stored?.url || file.url || null;
  }
  return {
    ok: true,
    fileUrl: url,
    mimeType: file.mimetype || inspection.mime || null,
    originalName: file.originalname || file.originalName || null,
  };
}

async function listForParent(parentId) {
  if (!parentId) return [];
  return prisma.parentStudent.findMany({
    where: { parentId },
    include: {
      student: {
        include: {
          class: { include: { school: true } },
          absences: {
            orderBy: { date: 'desc' },
            include: {
              justifications: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
          },
        },
      },
    },
  });
}

async function listForSchool({ schoolId, status } = {}) {
  if (!schoolId) return [];
  const where = { schoolId };
  const st = String(status || '').trim().toUpperCase();
  if (st === STATUS.PENDING || st === STATUS.ACCEPTED || st === STATUS.REFUSED) {
    where.status = st;
  }
  return prisma.absenceJustification.findMany({
    where,
    include: {
      absence: true,
      student: { include: { class: true } },
      parent: { include: { user: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
  });
}

async function submitJustification({ parent, absenceId, motif, file } = {}) {
  if (!parent?.id) return forbidden();

  const id = String(absenceId || '').trim();
  if (!id) return { ok: false, error: 'data' };

  const absence = await prisma.absence.findFirst({
    where: {
      id,
      student: { parents: { some: { parentId: parent.id } } },
    },
    include: { student: { include: { class: true } } },
  });
  if (!absence) return forbidden();

  const text = String(motif || '').trim();
  if (!text) return { ok: false, error: 'motif' };
  if (text.length > 500) return { ok: false, error: 'motif' };

  if (absence.justified || absence.justificationStatus === STATUS.ACCEPTED) {
    return { ok: false, error: 'accepted' };
  }

  const schoolId = schoolIdOf(absence.student);
  if (!schoolId) return { ok: false, error: 'data' };

  const stored = await storeProof(file);
  if (!stored.ok) return stored;

  const row = await prisma.absenceJustification.create({
    data: {
      absenceId: absence.id,
      parentId: parent.id,
      studentId: absence.studentId,
      schoolId,
      motif: text,
      fileUrl: stored.fileUrl,
      mimeType: stored.mimeType,
      originalName: stored.originalName,
      status: STATUS.PENDING,
    },
  });

  await prisma.absence.update({
    where: { id: absence.id },
    data: { justified: false, justificationStatus: STATUS.PENDING },
  });

  return { ok: true, justification: row };
}

async function notifyReview(userId, accepted, student, schoolId) {
  if (!userId) return;
  const name = `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || 'votre enfant';
  const type = accepted ? 'justification_accepted' : 'justification_refused';
  const body = accepted
    ? `Le justificatif pour ${name} a été accepté. L’absence est marquée justifiée.`
    : `Le justificatif pour ${name} a été refusé. Vous pouvez en soumettre un autre.`;
  try {
    await sendNotification(userId, type, body, { schoolId });
  } catch {
    /* notification optionnelle */
  }
}

async function reviewJustification({ school, id, action, user } = {}) {
  if (!school?.id) return forbidden();
  const next = parseAction(action);
  if (!next) return { ok: false, error: 'action' };

  const row = await prisma.absenceJustification.findFirst({
    where: { id: String(id || '').trim(), schoolId: school.id },
    include: { absence: true, parent: true, student: true },
  });
  if (!row) return forbidden();

  const accepted = next === STATUS.ACCEPTED;
  const now = new Date();

  await prisma.absenceJustification.update({
    where: { id: row.id },
    data: {
      status: next,
      reviewedAt: now,
      reviewedBy: user?.id || null,
    },
  });

  await prisma.absence.update({
    where: { id: row.absenceId },
    data: {
      justified: accepted,
      justificationStatus: next,
    },
  });

  await notifyReview(row.parent?.userId, accepted, row.student, school.id);
  return { ok: true, status: next };
}

module.exports = {
  STATUS,
  STATUS_LABELS,
  typeLabel,
  statusLabel,
  parseAction,
  listForParent,
  listForSchool,
  submitJustification,
  reviewJustification,
};
