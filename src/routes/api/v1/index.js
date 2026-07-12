const express = require('express');
const apiController = require('../../../controllers/apiController');
const { requireAuth, requireRole } = require('../../../middleware/auth');
const { apiLimiter } = require('../../../middleware/rateLimit');

const router = express.Router();

router.use(apiLimiter, requireAuth);

router.get('/students', requireRole('SCHOOL_ADMIN', 'TEACHER'), apiController.listStudents);
router.get('/students/:id', requireRole('SCHOOL_ADMIN', 'TEACHER'), apiController.getStudent);
router.get('/classes', requireRole('SCHOOL_ADMIN', 'TEACHER'), apiController.listClasses);
router.get('/notifications', apiController.listNotifications);
router.post('/notifications/:id/read', apiController.markNotificationRead);

module.exports = router;
