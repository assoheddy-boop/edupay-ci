const express = require('express');
const studentController = require('../controllers/studentController');
const { requireAuth, checkRole } = require('../middleware/auth');
const { attachModules, requireModule } = require('../middleware/modules');

const router = express.Router();

router.use(requireAuth, checkRole('student'), attachModules);

router.get('/dashboard', studentController.dashboard);
router.get('/grades', requireModule('grades'), studentController.grades);
router.get('/bulletins/:bulletinId/pdf', requireModule('grades'), studentController.downloadBulletinPdf);
router.get('/homeworks', requireModule('homeworks'), studentController.homeworks);
router.get('/homeworks/events', requireModule('homeworks'), studentController.homeworkEvents);
router.get('/timetable', studentController.timetable);

module.exports = router;
