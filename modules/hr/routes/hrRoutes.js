const express = require('express');
const hrController = require('../hrController');
const { requireAuth, requireRole } = require('../../../src/middleware/auth');
const { attachModules, requireModule } = require('../../../src/middleware/modules');

const router = express.Router();

router.use(
  requireAuth,
  requireRole('SCHOOL_ADMIN', 'TEACHER'),
  attachModules,
  requireModule('hr'),
);

router.get('/', (_req, res) => res.redirect('/hr/profile'));
router.get('/profile', hrController.profilePage);
router.post('/profile', hrController.saveProfile);

router.get('/leave', hrController.leavePage);
router.post('/leave', hrController.createLeave);

router.get('/presence', hrController.presencePage);

router.get('/payroll', hrController.payrollPage);
router.post('/payroll', hrController.createPayroll);

router.get('/evaluation', hrController.evaluationPage);
router.post('/evaluation', hrController.createEvaluation);

module.exports = router;
