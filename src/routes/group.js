const express = require('express');
const groupController = require('../controllers/groupController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('ORGANIZATION_ADMIN'));

router.get('/dashboard', groupController.dashboard);

module.exports = router;
