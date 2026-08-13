const express = require('express');
const groupController = require('../controllers/groupController');
const upload = require('../middleware/upload');
const { requireAuth, checkRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, checkRole('group'));

router.get('/dashboard', groupController.dashboard);
router.get('/campuses', groupController.campuses);
router.get('/campuses/:id', groupController.campusDetail);
router.get('/finance', groupController.finance);
router.get('/hr', groupController.hrPage);
router.get('/compare', groupController.comparePage);
router.get('/circulars', groupController.circularsPage);
router.post('/circulars', groupController.sendCircular);
router.get('/settings', groupController.settingsPage);
router.post('/settings', upload.logoUpload.single('logo'), groupController.updateSettings);
router.post('/settings/admins', groupController.inviteAdmin);
router.get('/export', groupController.exportGroup);

module.exports = router;
