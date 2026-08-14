const express = require('express');

const parentController = require('../controllers/parentController');

const messageController = require('../controllers/messageController');

const extras = require('../controllers/extrasController');

const { requireAuth, checkRole } = require('../middleware/auth');

const { attachModules, requireModule } = require('../middleware/modules');

const { addChildRules, handleValidationErrors } = require('../middleware/validators');

const upload = require('../middleware/upload');
const { chatUpload } = upload;



const router = express.Router();



router.use(requireAuth, checkRole('parent'), attachModules);



router.get('/dashboard', parentController.dashboard);

router.post('/children', addChildRules, handleValidationErrors, parentController.addChild);

router.post('/select-school', parentController.selectSchool);

router.get('/notifications', parentController.notificationsPage);

router.post('/notifications/:id/read', parentController.markNotificationRead);

router.post('/notifications/read-all', parentController.markAllNotificationsRead);

router.get('/payments', requireModule('payments'), parentController.payments);

router.post('/payments', requireModule('payments'), upload.single('proof'), parentController.createPayment);

router.get('/grades', requireModule('grades'), parentController.grades);

router.get('/homeworks', requireModule('homeworks'), parentController.homeworks);

router.get('/timeline', parentController.timeline);

router.get('/messages', requireModule('chat'), messageController.inbox);

router.get('/messages/:partnerId', requireModule('chat'), messageController.chat);

router.post('/messages/:partnerId', requireModule('chat'), chatUpload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'attachment', maxCount: 1 },
]), messageController.send);

router.get('/suivi', requireModule('absences'), extras.parentSuiviPage);

router.get('/pickup', requireModule('pickup'), extras.parentPickupPage);

router.post('/pickup', requireModule('pickup'), extras.createPickupAuth);

router.get('/activities', requireModule('activities'), extras.parentActivitiesPage);

router.post('/activities/enroll', requireModule('activities'), extras.enrollActivity);

router.get('/transport', requireModule('transport'), extras.parentTransportPage);

router.get('/canteen', requireModule('canteen'), extras.parentCanteenPage);

router.get('/health', requireModule('health'), extras.parentHealthPage);

router.get('/privacy', parentController.privacyPage);

router.post('/privacy', parentController.updateConsent);

module.exports = router;

