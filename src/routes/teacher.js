const express = require('express');
const teacherController = require('../controllers/teacherController');
const messageController = require('../controllers/messageController');
const extras = require('../controllers/extrasController');
const teacherHrController = require('../controllers/teacherHrController');
const { requireAuth, checkRole } = require('../middleware/auth');
const { attachModules, requireModule } = require('../middleware/modules');
const upload = require('../middleware/upload');
const { persistUpload } = upload;

const router = express.Router();

router.use(requireAuth, checkRole('teacher'), attachModules);

router.get('/dashboard', teacherController.dashboard);
router.get('/students', teacherController.students);
router.get('/grades', requireModule('grades'), teacherController.grades);
router.post('/grades', requireModule('grades'), teacherController.createGrade);
router.get('/absences', requireModule('absences'), teacherController.absences);
router.post('/absences', requireModule('absences'), teacherController.createAbsence);
router.get('/homeworks', requireModule('homeworks'), teacherController.homeworks);
router.get('/homeworks/events', requireModule('homeworks'), teacherController.homeworkEvents);
router.post('/homeworks', requireModule('homeworks'), upload.single('attachment'), persistUpload('homeworks'), teacherController.createHomework);
router.get('/schedule', teacherController.schedulePage);
router.post('/schedule', teacherController.createSchedule);
router.get('/attendance', requireModule('absences'), teacherController.attendancePage);
router.post('/attendance', requireModule('absences'), teacherController.submitAttendance);
router.get('/bulk-grades', requireModule('grades'), teacherController.bulkGradesPage);
router.post('/bulk-grades', requireModule('grades'), teacherController.submitBulkGrades);
router.get('/messages', requireModule('chat'), messageController.inbox);
router.get('/messages/:partnerId', requireModule('chat'), messageController.chat);
router.post('/messages/:partnerId', requireModule('chat'), upload.chatUpload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'attachment', maxCount: 1 },
]), persistUpload('chat'), messageController.send);
router.get('/transport', requireModule('transport'), extras.transportPage);
router.post('/transport', requireModule('transport'), extras.createTransportLog);
router.get('/behavior', requireModule('behavior'), extras.behaviorPage);
router.post('/behavior/note', requireModule('behavior'), extras.createBehaviorNote);
router.post('/behavior/badge', requireModule('behavior'), extras.awardBadge);
router.get('/health', requireModule('health'), extras.healthPage);
router.post('/health', requireModule('health'), extras.createHealthIncident);
router.get('/canteen', requireModule('canteen'), extras.canteenPage);
router.post('/canteen', requireModule('canteen'), extras.recordCanteen);

router.get('/hr', requireModule('hr'), teacherHrController.dashboard);
router.get('/hr/profile', requireModule('hr'), teacherHrController.profile);
router.get('/hr/leaves', requireModule('hr'), teacherHrController.leavesPage);
router.post('/hr/leaves', requireModule('hr'), teacherHrController.requestLeave);
router.get('/hr/payslips', requireModule('hr'), teacherHrController.payslipsPage);
router.post('/hr/advances', requireModule('hr'), teacherHrController.requestAdvance);
router.get('/hr/attendance', requireModule('hr'), teacherHrController.attendancePage);
router.post('/hr/attendance/check-in', requireModule('hr'), teacherHrController.clockIn);
router.post('/hr/attendance/check-out', requireModule('hr'), teacherHrController.clockOut);
router.get('/hr/evaluations', requireModule('hr'), teacherHrController.evaluationsPage);

module.exports = router;
