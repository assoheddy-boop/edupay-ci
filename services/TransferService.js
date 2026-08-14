const prisma = require('../src/config/database');
const logger = require('./logger');
const { getIo } = require('../src/config/socket');

const TRANSFER_INCLUDE = {
  student: { include: { class: true } },
  fromSchool: { include: { admin: true } },
  toSchool: { include: { admin: true } },
  requestedBy: true,
  targetClass: true,
};

const OPEN_STATUSES = ['PENDING', 'APPROVED'];

function emitToUser(io, userId, event, payload) {
  if (!io || !userId) return;
  io.to(String(userId)).emit(event, payload);
  io.to(`user:${userId}`).emit(event, payload);
}

async function notifyTransferParties(transfer, { title, body, event }) {
  const recipients = new Set();
  if (transfer.requestedById) recipients.add(transfer.requestedById);
  if (transfer.toSchool?.adminId) recipients.add(transfer.toSchool.adminId);

  const admins = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true },
  });
  admins.forEach((admin) => recipients.add(admin.id));

  const io = getIo();
  const createdAt = new Date();

  await Promise.all([...recipients].map(async (userId) => {
    const notification = await prisma.notification.create({
      data: { userId, type: 'TRANSFER', title, body },
    });
    const payload = {
      id: notification.id,
      type: 'transfer',
      title,
      message: body,
      event,
      transferId: transfer.id,
      status: transfer.status,
      createdAt: notification.createdAt || createdAt,
    };
    emitToUser(io, userId, 'notification', payload);
    emitToUser(io, userId, 'transfer_update', payload);
  }));
}

function studentLabel(student) {
  if (!student) return 'élève';
  return `${student.firstName} ${student.lastName}`.trim();
}

function asTransferInput(first, second, extras = {}) {
  if (first && typeof first === 'object') return first;
  return { studentId: first, toSchoolId: second, id: first, ...extras };
}

async function requestTransfer(studentId, toSchoolId, extras = {}) {
  const input = asTransferInput(studentId, toSchoolId, extras);
  const sid = input.studentId;
  const destId = input.toSchoolId;
  let requestedById = input.requestedById;
  let parentProfileId = input.parentProfileId;
  const reason = input.reason;

  if (!sid || !destId) {
    return { ok: false, error: 'data' };
  }

  const student = await prisma.student.findUnique({
    where: { id: sid },
    include: { class: true, school: true },
  });
  if (!student?.schoolId) return { ok: false, error: 'student' };

  const linkWhere = { studentId: sid };
  if (parentProfileId) linkWhere.parentId = parentProfileId;
  const link = await prisma.parentStudent.findFirst({
    where: linkWhere,
    include: { parent: true },
  });
  if (!link) return { ok: false, error: 'parent' };
  requestedById = requestedById || link.parent.userId;

  if (student.schoolId === destId) return { ok: false, error: 'same_school' };

  const dest = await prisma.school.findUnique({
    where: { id: destId },
    include: { admin: true },
  });
  if (!dest) return { ok: false, error: 'school' };

  const existing = await prisma.transferRequest.findFirst({
    where: { studentId: sid, status: { in: OPEN_STATUSES } },
  });
  if (existing) return { ok: false, error: 'pending' };

  const transfer = await prisma.transferRequest.create({
    data: {
      studentId: sid,
      fromSchoolId: student.schoolId,
      toSchoolId: destId,
      requestedById,
      gender: student.gender ?? null,
      reason: reason ? String(reason).trim().slice(0, 500) : null,
    },
    include: TRANSFER_INCLUDE,
  });

  logger.info('transfer requested', { id: transfer.id, studentId: sid, toSchoolId: destId });

  await notifyTransferParties(transfer, {
    title: 'Demande de transfert',
    body: `Transfert de ${studentLabel(student)} vers ${dest.name}.`,
    event: 'requested',
  });

  return { ok: true, transfer };
}

async function approveTransfer(requestId, extras = {}) {
  const input = typeof requestId === 'object' && requestId ? requestId : { id: requestId, ...extras };
  const { id, schoolId, classId, note } = input;
  if (!id) return { ok: false, error: 'data' };

  const transfer = await prisma.transferRequest.findUnique({
    where: { id },
    include: TRANSFER_INCLUDE,
  });
  if (!transfer) return { ok: false, error: 'data' };
  if (schoolId && transfer.toSchoolId !== schoolId) return { ok: false, error: 'forbidden' };
  if (transfer.status !== 'PENDING') return { ok: false, error: 'status' };

  let targetClassId = classId || transfer.targetClassId || null;
  if (targetClassId) {
    const klass = await prisma.class.findFirst({
      where: { id: targetClassId, schoolId: transfer.toSchoolId },
    });
    if (!klass) return { ok: false, error: 'class' };
    targetClassId = klass.id;
  }

  const updated = await prisma.transferRequest.update({
    where: { id },
    data: {
      status: 'APPROVED',
      reviewedAt: new Date(),
      note: note ? String(note).trim().slice(0, 500) : transfer.note,
      targetClassId,
    },
    include: TRANSFER_INCLUDE,
  });

  logger.info('transfer approved', { id, schoolId: schoolId || transfer.toSchoolId });

  await notifyTransferParties(updated, {
    title: 'Transfert approuvé',
    body: `L'école ${updated.toSchool.name} a accepté le transfert de ${studentLabel(updated.student)}.`,
    event: 'approved',
  });

  return { ok: true, transfer: updated };
}

async function rejectTransfer(requestId, extras = {}) {
  const input = typeof requestId === 'object' && requestId ? requestId : { id: requestId, ...extras };
  const { id, schoolId, note } = input;
  if (!id) return { ok: false, error: 'data' };

  const transfer = await prisma.transferRequest.findUnique({
    where: { id },
    include: TRANSFER_INCLUDE,
  });
  if (!transfer) return { ok: false, error: 'data' };
  if (schoolId && transfer.toSchoolId !== schoolId) return { ok: false, error: 'forbidden' };
  if (transfer.status !== 'PENDING') return { ok: false, error: 'status' };

  const updated = await prisma.transferRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewedAt: new Date(),
      note: note ? String(note).trim().slice(0, 500) : transfer.note,
    },
    include: TRANSFER_INCLUDE,
  });

  logger.info('transfer rejected', { id, schoolId: schoolId || transfer.toSchoolId });

  await notifyTransferParties(updated, {
    title: 'Transfert refusé',
    body: `L'école ${updated.toSchool.name} a refusé le transfert de ${studentLabel(updated.student)}.`,
    event: 'rejected',
  });

  return { ok: true, transfer: updated };
}

async function resolveTargetClass(transfer, classId) {
  const schoolId = transfer.toSchoolId;
  if (classId) {
    const klass = await prisma.class.findFirst({ where: { id: classId, schoolId } });
    return klass || null;
  }
  if (transfer.targetClassId) {
    const klass = await prisma.class.findFirst({
      where: { id: transfer.targetClassId, schoolId },
    });
    if (klass) return klass;
  }
  const sameLevel = transfer.student?.class?.level
    ? await prisma.class.findFirst({
      where: { schoolId, level: transfer.student.class.level },
      orderBy: { name: 'asc' },
    })
    : null;
  if (sameLevel) return sameLevel;
  return prisma.class.findFirst({ where: { schoolId }, orderBy: { name: 'asc' } });
}

async function completeTransfer(requestId, extras = {}) {
  const input = typeof requestId === 'object' && requestId
    ? requestId
    : { id: requestId, classId: typeof extras === 'string' ? extras : extras.classId };
  const { id, classId } = input;
  if (!id) return { ok: false, error: 'data' };

  const transfer = await prisma.transferRequest.findUnique({
    where: { id },
    include: TRANSFER_INCLUDE,
  });
  if (!transfer) return { ok: false, error: 'data' };
  if (transfer.status !== 'APPROVED') return { ok: false, error: 'status' };

  const targetClass = await resolveTargetClass(transfer, classId);
  if (!targetClass) return { ok: false, error: 'class' };

  try {
    const [updated] = await prisma.$transaction([
      prisma.student.update({
        where: { id: transfer.studentId },
        data: {
          schoolId: transfer.toSchoolId,
          classId: targetClass.id,
        },
      }),
      prisma.transferRequest.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          targetClassId: targetClass.id,
        },
        include: TRANSFER_INCLUDE,
      }),
    ]);

    const completed = await prisma.transferRequest.findUnique({
      where: { id },
      include: TRANSFER_INCLUDE,
    });

    logger.info('transfer completed', { id, classId: targetClass.id });

    await notifyTransferParties(completed, {
      title: 'Transfert terminé',
      body: `${studentLabel(completed.student)} est maintenant inscrit à ${completed.toSchool.name}.`,
      event: 'completed',
    });

    return { ok: true, transfer: completed, student: updated };
  } catch (err) {
    if (err?.code === 'P2002') return { ok: false, error: 'matricule' };
    logger.error('transfer complete failed', { id, error: err.message });
    return { ok: false, error: 'data' };
  }
}

function listTransfersForParent(requestedById) {
  return prisma.transferRequest.findMany({
    where: { requestedById },
    include: TRANSFER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

function listTransfersForSchool(schoolId) {
  return prisma.transferRequest.findMany({
    where: { OR: [{ toSchoolId: schoolId }, { fromSchoolId: schoolId }] },
    include: TRANSFER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

function listAllTransfers() {
  return prisma.transferRequest.findMany({
    include: TRANSFER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

async function getTransferStats(schoolId) {
  const where = { status: 'COMPLETED' };
  if (schoolId) where.fromSchoolId = schoolId;

  const transfers = await prisma.transferRequest.findMany({
    where,
    select: {
      gender: true,
      student: { select: { gender: true } },
    },
  });

  let boysTransferred = 0;
  let girlsTransferred = 0;

  transfers.forEach((t) => {
    const g = t.gender ?? t.student?.gender ?? null;
    if (g === 'M') boysTransferred += 1;
    else if (g === 'F') girlsTransferred += 1;
  });

  return {
    boysTransferred,
    girlsTransferred,
    totalTransferred: transfers.length,
  };
}

module.exports = {
  requestTransfer,
  approveTransfer,
  rejectTransfer,
  completeTransfer,
  listTransfersForParent,
  listTransfersForSchool,
  listAllTransfers,
  getTransferStats,
  TRANSFER_INCLUDE,
};
