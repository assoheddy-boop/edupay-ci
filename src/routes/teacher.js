const express = require('express');
const teacherController = require('../controllers/teacherController');
const messageController = require('../controllers/messageController');
const extras = require('../controllers/extrasController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { attachModules, requireModule } = require('../middleware/modules');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(requireAuth, requireRole('TEACHER'), attachModules);

router.get('/dashboard', teacherController.dashboard);
router.get('/students', teacherController.students);
router.get('/grades', requireModule('grades'), teacherController.grades);
router.post('/grades', requireModule('grades'), teacherController.createGrade);
router.get('/absences', requireModule('absences'), teacherController.absences);
router.post('/absences', requireModule('absences'), teacherController.createAbsence);
router.get('/homeworks', requireModule('homeworks'), teacherController.homeworks);
router.post('/homeworks', requireModule('homeworks'), upload.single('attachment'), teacherController.createHomework);
router.get('/schedule', teacherController.schedulePage);
router.post('/schedule', teacherController.createSchedule);
router.get('/attendance', requireModule('absences'), teacherController.attendancePage);
router.post('/attendance', requireModule('absences'), teacherController.submitAttendance);
router.get('/bulk-grades', requireModule('grades'), teacherController.bulkGradesPage);
router.post('/bulk-grades', requireModule('grades'), teacherController.submitBulkGrades);
router.get('/messages', requireModule('chat'), messageController.inbox);
router.get('/messages/:partnerId', requireModule('chat'), messageController.chat);
router.post('/messages/:partnerId', requireModule('chat'), upload.single('audio'), messageController.send);
router.get('/transport', requireModule('transport'), extras.transportPage);
router.post('/transport', requireModule('transport'), extras.createTransportLog);
router.get('/behavior', requireModule('behavior'), extras.behaviorPage);
router.post('/behavior/note', requireModule('behavior'), extras.createBehaviorNote);
router.post('/behavior/badge', requireModule('behavior'), extras.awardBadge);
router.get('/health', requireModule('health'), extras.healthPage);
router.post('/health', requireModule('health'), extras.createHealthIncident);
router.get('/canteen', requireModule('canteen'), extras.canteenPage);
router.post('/canteen', requireModule('canteen'), extras.recordCanteen);

module.exports = router;
