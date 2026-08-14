const express = require('express');
const genderStatsController = require('../src/controllers/genderStatsController');
const { requireAuth } = require('../src/middleware/auth');

const router = express.Router();

router.get('/class/:id', requireAuth, genderStatsController.classGenderStats);
router.get('/school/:id', requireAuth, genderStatsController.schoolGenderStats);
router.get('/group/:id', requireAuth, genderStatsController.groupGenderStats);

module.exports = router;
