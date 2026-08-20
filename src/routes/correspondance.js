const express = require('express');
const correspondanceController = require('../controllers/correspondanceController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { attachModules, requireModule } = require('../middleware/modules');
const { csrfProtection } = require('../middleware/csrfProtection');
const { auditMiddleware } = require('../utils/audit');
const upload = require('../middleware/upload');
const { persistUpload } = upload;

const router = express.Router();

router.use(requireAuth, requireRole('SCHOOL_ADMIN', 'TEACHER'), attachModules, csrfProtection);

router.get('/', requireModule('correspondance'), correspondanceController.dashboard);

router.post(
  '/jumelage',
  requireModule('correspondance'),
  auditMiddleware('correspondance_jumelage_request', 'EcoleCorrespondance'),
  correspondanceController.createJumelage,
);

router.post(
  '/jumelage/:id/approve',
  requireModule('correspondance'),
  auditMiddleware('correspondance_jumelage_approve', 'EcoleCorrespondance'),
  correspondanceController.reviewJumelage,
);

router.post(
  '/jumelage/:id/reject',
  requireModule('correspondance'),
  auditMiddleware('correspondance_jumelage_reject', 'EcoleCorrespondance'),
  correspondanceController.reviewJumelage,
);

router.post(
  '/message',
  requireModule('correspondance'),
  auditMiddleware('correspondance_message_send', 'MessageCorrespondance'),
  correspondanceController.sendMessage,
);

router.post(
  '/projet',
  requireModule('correspondance'),
  upload.chatUpload.array('fichiers', 5),
  persistUpload('correspondance'),
  auditMiddleware('correspondance_projet_create', 'ProjetCorrespondance'),
  correspondanceController.createProjet,
);

router.get('/calendrier/events', requireModule('correspondance'), correspondanceController.calendarEvents);

router.post(
  '/calendrier',
  requireModule('correspondance'),
  auditMiddleware('correspondance_calendar_create', 'CalendrierCorrespondance'),
  correspondanceController.createCalendarEvent,
);

router.post(
  '/calendrier/:id/delete',
  requireModule('correspondance'),
  auditMiddleware('correspondance_calendar_delete', 'CalendrierCorrespondance'),
  correspondanceController.deleteCalendarEvent,
);

module.exports = router;
