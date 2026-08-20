const correspondance = require('../services/correspondance');
const { logAudit } = require('../utils/audit');
const { emitToUser } = require('../config/socket');
const { collectMulterFiles, publicUrlFor } = require('../../services/StorageService');

function layoutForUser(user) {
  return user?.role === 'TEACHER' ? '../../layouts/teacherLayout' : '../../layouts/schoolLayout';
}

function redirectDashboard(res, query = '') {
  return res.redirect(`/correspondance${query ? `?${query}` : ''}`);
}

function handleServiceError(err, req, res) {
  const status = err.status || 500;
  if (req.accepts('json') && !req.accepts('html')) {
    return res.status(status).json({ error: err.message || 'Erreur' });
  }
  return redirectDashboard(res, `error=${encodeURIComponent(err.message || 'Erreur')}`);
}

async function dashboard(req, res, next) {
  try {
    const prisma = require('../config/database');
    const schoolId = await correspondance.resolveUserSchoolId(req.user, req);
    if (!schoolId) {
      return res.status(403).render('error', { message: 'Établissement introuvable', user: req.user });
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, correspondanceCountry: true },
    });

    const jumelages = await correspondance.listJumelagesForSchool(schoolId);
    const approved = jumelages.filter((j) => j.status === 'APPROVED');
    const pending = jumelages.filter((j) => j.status === 'PENDING');

    const partnerCountry = school.correspondanceCountry === 'CI' ? 'FR' : 'CI';
    const candidates = await correspondance.listPartnerCandidates(schoolId, partnerCountry);

    const activeTab = req.query.tab || 'messages';
    const selectedJumelageId = req.query.jumelage || (approved[0]?.id || pending[0]?.id || '');

    let messages = [];
    let projets = [];
    let calendarEvents = [];
    let partnerContacts = [];

    const selected = jumelages.find((j) => j.id === selectedJumelageId);
    if (selected && selected.status === 'APPROVED') {
      [messages, projets, calendarEvents, partnerContacts] = await Promise.all([
        correspondance.listMessages(selected.id, schoolId),
        correspondance.listProjets(selected.id, schoolId),
        correspondance.listCalendarEvents(selected.id, schoolId),
        correspondance.getPartnerContacts(selected, schoolId),
      ]);
    }

    const layout = layoutForUser(req.user);
    res.render('school/correspondance/dashboard', {
      user: req.user,
      school,
      jumelages,
      approved,
      pending,
      candidates,
      partnerCountry,
      activeTab,
      selectedJumelageId,
      selected,
      messages,
      projets,
      calendarEvents,
      partnerContacts,
      success: req.query.success,
      error: req.query.error,
      layout,
      correspondanceCss: true,
    });
  } catch (err) {
    next(err);
  }
}

async function createJumelage(req, res) {
  try {
    const schoolId = await correspondance.resolveUserSchoolId(req.user, req);
    const { partenaireId, note } = req.body;
    if (!partenaireId) {
      return handleServiceError(Object.assign(new Error('École partenaire requise'), { status: 400 }), req, res);
    }

    const jumelage = await correspondance.requestJumelage({
      ecoleId: schoolId,
      partenaireId,
      requestedById: req.user.id,
      note,
    });

    const partnerAdminId = jumelage.partenaire?.admin?.id;
    if (partnerAdminId) {
      emitToUser(partnerAdminId, 'correspondance_jumelage', {
        jumelageId: jumelage.id,
        from: jumelage.ecole?.name,
      });
    }

    await logAudit({
      action: 'correspondance_jumelage_request',
      entity: 'EcoleCorrespondance',
      entityId: jumelage.id,
      user: req.user,
      ip: req.ip,
      schoolId,
      details: { partenaireId },
    });

    return redirectDashboard(res, 'success=jumelage_demande');
  } catch (err) {
    return handleServiceError(err, req, res);
  }
}

async function reviewJumelage(req, res) {
  try {
    if (!correspondance.canModerateJumelage(req.user)) {
      return res.status(403).render('error', { message: 'Seuls les enseignants et la direction peuvent valider', user: req.user });
    }

    const schoolId = await correspondance.resolveUserSchoolId(req.user, req);
    const approve = req.path.includes('/approve') || req.body.approve === '1';
    const jumelage = await correspondance.reviewJumelage({
      jumelageId: req.params.id,
      schoolId,
      userId: req.user.id,
      approve,
      note: req.body.note,
    });

    const notifyId = jumelage.requestedById;
    if (notifyId) {
      emitToUser(notifyId, 'correspondance_jumelage_review', {
        jumelageId: jumelage.id,
        status: jumelage.status,
      });
    }

    await logAudit({
      action: approve ? 'correspondance_jumelage_approve' : 'correspondance_jumelage_reject',
      entity: 'EcoleCorrespondance',
      entityId: jumelage.id,
      user: req.user,
      ip: req.ip,
      schoolId,
    });

    return redirectDashboard(res, `success=${approve ? 'jumelage_approuve' : 'jumelage_refuse'}`);
  } catch (err) {
    return handleServiceError(err, req, res);
  }
}

async function sendMessage(req, res) {
  try {
    const schoolId = await correspondance.resolveUserSchoolId(req.user, req);
    const { jumelageId, destinataireId, contenu, scope } = req.body;
    if (!jumelageId || !destinataireId) {
      return handleServiceError(Object.assign(new Error('Jumelage et destinataire requis'), { status: 400 }), req, res);
    }

    const message = await correspondance.sendMessage({
      jumelageId,
      schoolId,
      expediteurId: req.user.id,
      destinataireId,
      contenu,
      scope: scope || 'TEACHER',
    });

    emitToUser(destinataireId, 'correspondance_message', message);

    await logAudit({
      action: 'correspondance_message_send',
      entity: 'MessageCorrespondance',
      entityId: message.id,
      user: req.user,
      ip: req.ip,
      schoolId,
      details: { jumelageId },
    });

    if (req.accepts('json') && req.get('X-Requested-With') === 'fetch') {
      return res.json({ ok: true, message });
    }
    return redirectDashboard(res, `tab=messages&jumelage=${jumelageId}&success=message_envoye`);
  } catch (err) {
    return handleServiceError(err, req, res);
  }
}

async function createProjet(req, res) {
  try {
    const schoolId = await correspondance.resolveUserSchoolId(req.user, req);
    const { jumelageId, titre, description } = req.body;
    if (!jumelageId) {
      return handleServiceError(Object.assign(new Error('Jumelage requis'), { status: 400 }), req, res);
    }

    const files = collectMulterFiles(req).map((f) => ({
      url: publicUrlFor(f, 'correspondance'),
      name: f.originalname,
      mimeType: f.mimetype,
    }));

    const projet = await correspondance.createProjet({
      jumelageId,
      schoolId,
      createdById: req.user.id,
      titre,
      description,
      fichiers: files,
    });

    const jumelage = await require('../config/database').ecoleCorrespondance.findUnique({
      where: { id: jumelageId },
      select: { ecoleId: true, partenaireId: true, ecole: { select: { adminId: true } }, partenaire: { select: { adminId: true } } },
    });
    if (jumelage) {
      const notifyIds = [jumelage.ecole?.adminId, jumelage.partenaire?.adminId].filter((id) => id && id !== req.user.id);
      notifyIds.forEach((uid) => emitToUser(uid, 'correspondance_projet', { projetId: projet.id, titre: projet.titre }));
    }

    await logAudit({
      action: 'correspondance_projet_create',
      entity: 'ProjetCorrespondance',
      entityId: projet.id,
      user: req.user,
      ip: req.ip,
      schoolId,
      details: { jumelageId, files: files.length },
    });

    return redirectDashboard(res, `tab=projets&jumelage=${jumelageId}&success=projet_cree`);
  } catch (err) {
    return handleServiceError(err, req, res);
  }
}

async function calendarEvents(req, res) {
  try {
    const schoolId = await correspondance.resolveUserSchoolId(req.user, req);
    const { jumelageId } = req.query;
    const events = await correspondance.listCalendarEvents(jumelageId, schoolId);
    res.json(events.map((ev) => ({
      id: ev.id,
      title: ev.evenement,
      start: ev.date,
      end: ev.endDate || undefined,
      extendedProps: { description: ev.description, participants: ev.participants },
    })));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur' });
  }
}

async function createCalendarEvent(req, res) {
  try {
    const schoolId = await correspondance.resolveUserSchoolId(req.user, req);
    const { jumelageId, evenement, description, date, endDate, participants } = req.body;

    const event = await correspondance.createCalendarEvent({
      jumelageId,
      schoolId,
      createdById: req.user.id,
      evenement,
      description,
      date,
      endDate,
      participants: participants ? JSON.parse(participants) : null,
    });

    const jumelage = await require('../config/database').ecoleCorrespondance.findUnique({
      where: { id: jumelageId },
      select: { ecole: { select: { adminId: true } }, partenaire: { select: { adminId: true } } },
    });
    if (jumelage) {
      [jumelage.ecole?.adminId, jumelage.partenaire?.adminId]
        .filter((id) => id && id !== req.user.id)
        .forEach((uid) => emitToUser(uid, 'correspondance_calendar', { eventId: event.id, title: event.evenement }));
    }

    await logAudit({
      action: 'correspondance_calendar_create',
      entity: 'CalendrierCorrespondance',
      entityId: event.id,
      user: req.user,
      ip: req.ip,
      schoolId,
    });

    if (req.accepts('json')) return res.json({ ok: true, event });
    return redirectDashboard(res, `tab=calendrier&jumelage=${jumelageId}&success=evenement_cree`);
  } catch (err) {
    return handleServiceError(err, req, res);
  }
}

async function deleteCalendarEvent(req, res) {
  try {
    const schoolId = await correspondance.resolveUserSchoolId(req.user, req);
    const { jumelageId } = req.body;
    await correspondance.deleteCalendarEvent({
      eventId: req.params.id,
      jumelageId,
      schoolId,
    });

    await logAudit({
      action: 'correspondance_calendar_delete',
      entity: 'CalendrierCorrespondance',
      entityId: req.params.id,
      user: req.user,
      ip: req.ip,
      schoolId,
    });

    return redirectDashboard(res, `tab=calendrier&jumelage=${jumelageId}&success=evenement_supprime`);
  } catch (err) {
    return handleServiceError(err, req, res);
  }
}

module.exports = {
  dashboard,
  createJumelage,
  reviewJumelage,
  sendMessage,
  createProjet,
  calendarEvents,
  createCalendarEvent,
  deleteCalendarEvent,
};
