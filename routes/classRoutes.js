const express = require('express');
const classController = require('../src/controllers/classController');
const { requireAuth, checkRole } = require('../src/middleware/auth');

const router = express.Router();

router.use(requireAuth, checkRole('school'));

router.get('/:id/stats', classController.genderStatsJson);
router.get('/:id/export.xlsx', classController.exportExcel);
router.get('/:id/export.pdf', classController.exportPdf);

module.exports = router;
