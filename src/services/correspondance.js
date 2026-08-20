const prisma = require('../config/database');
const { resolveActiveSchoolId } = require('../utils/schoolContext');

const JUMELAGE_INCLUDE = {
  ecole: {
    select: {
      id: true,
      name: true,
      logoUrl: true,
      logoBase64: true,
      city: true,
      publicDescription: true,
      correspondanceCountry: true,
      classes: { select: { id: true, name: true, level: true }, take: 12 },
      admin: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
    },
  },
  partenaire: {
    select: {
      id: true,
      name: true,
      logoUrl: true,
      logoBase64: true,
      city: true,
      publicDescription: true,
      correspondanceCountry: true,
      classes: { select: { id: true, name: true, level: true }, take: 12 },
      admin: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
    },
  },
  requestedBy: { select: { id: true, firstName: true, lastName: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
};

async function resolveUserSchoolId(user, req) {
  if (user?.school?.id) return user.school.id;
  if (user?.teacher?.schoolId) return user.teacher.schoolId;
  if (req) return resolveActiveSchoolId(req);
  return null;
}

function isSchoolAdmin(user) {
  return user?.role === 'SCHOOL_ADMIN';
}

function canModerateJumelage(user) {
  return user?.role === 'SCHOOL_ADMIN' || user?.role === 'TEACHER';
}

async function getSchoolWithCountry(schoolId) {
  return prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, correspondanceCountry: true, adminId: true },
  });
}

async function listJumelagesForSchool(schoolId) {
  return prisma.ecoleCorrespondance.findMany({
    where: {
      OR: [{ ecoleId: schoolId }, { partenaireId: schoolId }],
    },
    include: JUMELAGE_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

async function listPartnerCandidates(schoolId, country) {
  return prisma.school.findMany({
    where: {
      id: { not: schoolId },
      correspondanceCountry: country,
    },
    select: {
      id: true,
      name: true,
      city: true,
      logoUrl: true,
      logoBase64: true,
      publicDescription: true,
      correspondanceCountry: true,
    },
    orderBy: { name: 'asc' },
    take: 50,
  });
}

async function requestJumelage({ ecoleId, partenaireId, requestedById, note }) {
  const [ecole, partenaire] = await Promise.all([
    getSchoolWithCountry(ecoleId),
    getSchoolWithCountry(partenaireId),
  ]);
  if (!ecole || !partenaire) {
    throw Object.assign(new Error('Établissement introuvable'), { status: 404 });
  }
  if (ecole.correspondanceCountry === partenaire.correspondanceCountry) {
    throw Object.assign(new Error('Le jumelage requiert une école ivoirienne et une école française'), { status: 400 });
  }

  const existing = await prisma.ecoleCorrespondance.findFirst({
    where: {
      OR: [
        { ecoleId, partenaireId },
        { ecoleId: partenaireId, partenaireId: ecoleId },
      ],
    },
  });
  if (existing) {
    throw Object.assign(new Error('Une demande de jumelage existe déjà'), { status: 409 });
  }

  const ciSchoolId = ecole.correspondanceCountry === 'CI' ? ecole.id : partenaire.id;
  const frSchoolId = ecole.correspondanceCountry === 'FR' ? ecole.id : partenaire.id;

  return prisma.ecoleCorrespondance.create({
    data: {
      ecoleId: ciSchoolId,
      partenaireId: frSchoolId,
      requestedById,
      note: note || null,
      status: 'PENDING',
    },
    include: JUMELAGE_INCLUDE,
  });
}

async function reviewJumelage({ jumelageId, schoolId, userId, approve, note }) {
  const jumelage = await prisma.ecoleCorrespondance.findUnique({ where: { id: jumelageId } });
  if (!jumelage) {
    throw Object.assign(new Error('Jumelage introuvable'), { status: 404 });
  }
  if (jumelage.ecoleId !== schoolId && jumelage.partenaireId !== schoolId) {
    throw Object.assign(new Error('Accès refusé'), { status: 403 });
  }
  if (jumelage.status !== 'PENDING') {
    throw Object.assign(new Error('Ce jumelage a déjà été traité'), { status: 400 });
  }

  return prisma.ecoleCorrespondance.update({
    where: { id: jumelageId },
    data: {
      status: approve ? 'APPROVED' : 'REJECTED',
      approvedById: userId,
      approvedAt: new Date(),
      dateJumelage: approve ? new Date() : null,
      note: note || jumelage.note,
    },
    include: JUMELAGE_INCLUDE,
  });
}

async function assertApprovedJumelageAccess(jumelageId, schoolId) {
  const jumelage = await prisma.ecoleCorrespondance.findUnique({ where: { id: jumelageId } });
  if (!jumelage) {
    throw Object.assign(new Error('Jumelage introuvable'), { status: 404 });
  }
  if (jumelage.ecoleId !== schoolId && jumelage.partenaireId !== schoolId) {
    throw Object.assign(new Error('Accès refusé'), { status: 403 });
  }
  if (jumelage.status !== 'APPROVED') {
    throw Object.assign(new Error('Jumelage non approuvé'), { status: 403 });
  }
  return jumelage;
}

async function listMessages(jumelageId, schoolId, { take = 100 } = {}) {
  await assertApprovedJumelageAccess(jumelageId, schoolId);
  return prisma.messageCorrespondance.findMany({
    where: { jumelageId },
    include: {
      expediteur: { select: { id: true, firstName: true, lastName: true, role: true } },
      destinataire: { select: { id: true, firstName: true, lastName: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
    take,
  });
}

async function sendMessage({
  jumelageId,
  schoolId,
  expediteurId,
  destinataireId,
  contenu,
  scope = 'TEACHER',
}) {
  const jumelage = await assertApprovedJumelageAccess(jumelageId, schoolId);
  if (!contenu?.trim()) {
    throw Object.assign(new Error('Message vide'), { status: 400 });
  }

  const partnerSchoolId = jumelage.ecoleId === schoolId ? jumelage.partenaireId : jumelage.ecoleId;
  const destinataire = await prisma.user.findUnique({
    where: { id: destinataireId },
    include: { school: true, teacher: true },
  });
  if (!destinataire) {
    throw Object.assign(new Error('Destinataire introuvable'), { status: 404 });
  }

  const destSchoolId = destinataire.school?.id || destinataire.teacher?.schoolId;
  if (destSchoolId !== partnerSchoolId && destSchoolId !== schoolId) {
    throw Object.assign(new Error('Destinataire hors jumelage'), { status: 403 });
  }

  return prisma.messageCorrespondance.create({
    data: {
      jumelageId,
      expediteurId,
      destinataireId,
      contenu: contenu.trim(),
      scope,
    },
    include: {
      expediteur: { select: { id: true, firstName: true, lastName: true, role: true } },
      destinataire: { select: { id: true, firstName: true, lastName: true, role: true } },
    },
  });
}

async function listProjets(jumelageId, schoolId) {
  await assertApprovedJumelageAccess(jumelageId, schoolId);
  return prisma.projetCorrespondance.findMany({
    where: { jumelageId },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function createProjet({
  jumelageId,
  schoolId,
  createdById,
  titre,
  description,
  fichiers,
}) {
  await assertApprovedJumelageAccess(jumelageId, schoolId);
  if (!titre?.trim()) {
    throw Object.assign(new Error('Titre requis'), { status: 400 });
  }

  return prisma.projetCorrespondance.create({
    data: {
      jumelageId,
      titre: titre.trim(),
      description: description?.trim() || null,
      fichiers: fichiers?.length ? fichiers : null,
      createdById,
    },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

async function listCalendarEvents(jumelageId, schoolId) {
  await assertApprovedJumelageAccess(jumelageId, schoolId);
  return prisma.calendrierCorrespondance.findMany({
    where: { jumelageId },
    orderBy: { date: 'asc' },
  });
}

async function createCalendarEvent({
  jumelageId,
  schoolId,
  createdById,
  evenement,
  description,
  date,
  endDate,
  participants,
}) {
  await assertApprovedJumelageAccess(jumelageId, schoolId);
  if (!evenement?.trim() || !date) {
    throw Object.assign(new Error('Événement et date requis'), { status: 400 });
  }

  return prisma.calendrierCorrespondance.create({
    data: {
      jumelageId,
      evenement: evenement.trim(),
      description: description?.trim() || null,
      date: new Date(date),
      endDate: endDate ? new Date(endDate) : null,
      participants: participants || null,
      createdById,
    },
  });
}

async function deleteCalendarEvent({ eventId, jumelageId, schoolId }) {
  await assertApprovedJumelageAccess(jumelageId, schoolId);
  const event = await prisma.calendrierCorrespondance.findFirst({
    where: { id: eventId, jumelageId },
  });
  if (!event) {
    throw Object.assign(new Error('Événement introuvable'), { status: 404 });
  }
  await prisma.calendrierCorrespondance.delete({ where: { id: eventId } });
  return event;
}

async function getPartnerContacts(jumelage, schoolId) {
  const partner = jumelage.ecoleId === schoolId ? jumelage.partenaire : jumelage.ecole;
  const teachers = await prisma.teacher.findMany({
    where: { schoolId: partner.id },
    include: { user: { select: { id: true, firstName: true, lastName: true, role: true, email: true } } },
    take: 20,
  });
  const contacts = [];
  if (partner.admin) {
    contacts.push({ ...partner.admin, role: 'SCHOOL_ADMIN', label: 'Direction' });
  }
  teachers.forEach((t) => {
    if (t.user) contacts.push({ ...t.user, label: t.subject || 'Enseignant' });
  });
  return contacts;
}

module.exports = {
  resolveUserSchoolId,
  isSchoolAdmin,
  canModerateJumelage,
  listJumelagesForSchool,
  listPartnerCandidates,
  requestJumelage,
  reviewJumelage,
  listMessages,
  sendMessage,
  listProjets,
  createProjet,
  listCalendarEvents,
  createCalendarEvent,
  deleteCalendarEvent,
  getPartnerContacts,
  JUMELAGE_INCLUDE,
};
