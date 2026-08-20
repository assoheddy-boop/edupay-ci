const express = require('express');

const parentController = require('../controllers/parentController');

const messageController = require('../controllers/messageController');

const extras = require('../controllers/extrasController');
const justificationController = require('../controllers/justificationController');
const convocationController = require('../controllers/convocationController');

const { requireAuth, checkRole } = require('../middleware/auth');

const { attachModules, requireModule } = require('../middleware/modules');
const { attachConsentPrompt } = require('../middleware/consentPrompt');
const { attachUnreadNotifications } = require('../middleware/unreadNotifications');
const { csrfProtection } = require('../middleware/csrfProtection');
const { childLinkLimiter } = require('../middleware/rateLimit');
const { addChildRules, handleValidationErrors } = require('../middleware/validators');

const upload = require('../middleware/upload');
const { chatUpload, persistUpload, hrDocUpload } = upload;

const router = express.Router();

router.use(requireAuth, checkRole('parent'), attachModules, attachConsentPrompt, attachUnreadNotifications, csrfProtection);

router.get('/dashboard', parentController.dashboard);

router.post('/children', childLinkLimiter, addChildRules, handleValidationErrors, parentController.addChild);

router.post('/select-school', parentController.selectSchool);

router.get('/notifications', parentController.notificationsPage);

router.post('/notifications/:id/read', parentController.markNotificationRead);

router.post('/notifications/read-all', parentController.markAllNotificationsRead);

router.get('/payments', requireModule('payments'), parentController.payments);

router.post('/payments', requireModule('payments'), upload.single('proof'), parentController.createPayment);

router.get('/grades', requireModule('grades'), parentController.grades);
router.get('/bulletins/:bulletinId/pdf', requireModule('grades'), parentController.downloadBulletinPdf);

router.get('/homeworks', requireModule('homeworks'), parentController.homeworks);
router.get('/homeworks/events', requireModule('homeworks'), parentController.homeworkEvents);
router.get('/calendar', requireModule('homeworks'), parentController.homeworks);

router.get('/timeline', parentController.timeline);

router.get('/messages', requireModule('chat'), messageController.inbox);

router.get('/messages/:partnerId', requireModule('chat'), messageController.chat);

router.post('/messages/:partnerId', requireModule('chat'), chatUpload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'attachment', maxCount: 1 },
]), persistUpload('chat'), messageController.send);

router.get('/suivi', requireModule('absences'), extras.parentSuiviPage);

router.get('/justificatifs', requireModule('absences'), justificationController.parentPage);

router.post('/justificatifs', requireModule('absences'), hrDocUpload.single('proof'), persistUpload('justificatifs'), justificationController.submit);

router.get('/convocations', convocationController.parentConvocationsPage);
router.get('/convocations/:id/imprimer', convocationController.parentConvocationPrint);
router.get('/convocations/:id/pdf', convocationController.parentConvocationPdf);
router.get('/convocations/:id.pdf', convocationController.parentConvocationPdf);

router.get('/pickup', requireModule('pickup'), extras.parentPickupPage);

router.post('/pickup', requireModule('pickup'), extras.createPickupAuth);

router.get('/activities', requireModule('activities'), extras.parentActivitiesPage);

router.post('/activities/enroll', requireModule('activities'), extras.enrollActivity);

router.get('/transport', requireModule('transport'), extras.parentTransportPage);

router.get('/canteen', requireModule('canteen'), extras.parentCanteenPage);

router.get('/health', requireModule('health'), extras.parentHealthPage);

router.get('/privacy', parentController.privacyPage);

router.post('/privacy', parentController.updateConsent);

router.post('/privacy/first-login', parentController.handleFirstLoginConsent);

router.get('/account', parentController.accountSettingsPage);
router.get('/account/export', parentController.accountExport);
router.post('/account/delete-request', parentController.accountDeleteRequest);

module.exports = router;

