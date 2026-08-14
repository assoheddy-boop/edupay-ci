const express = require('express');
const transferController = require('../src/controllers/transferController');
const { requireAuth, checkRole } = require('../src/middleware/auth');

const router = express.Router();

router.get('/', requireAuth, checkRole('parent'), transferController.parentPage);
router.post('/request', requireAuth, checkRole('parent'), transferController.request);

router.get('/requests', requireAuth, checkRole('school'), transferController.schoolPage);
router.get('/stats/:schoolId', requireAuth, transferController.stats);
router.post('/approve/:id', requireAuth, checkRole('school'), transferController.approve);
router.post('/reject/:id', requireAuth, checkRole('school'), transferController.reject);

router.get('/dashboard', requireAuth, checkRole('admin'), transferController.adminPage);
router.post('/complete/:id', requireAuth, checkRole('admin'), transferController.complete);

module.exports = router;
