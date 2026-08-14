const express = require('express');
const reinscriptionController = require('../src/controllers/reinscriptionController');
const { requireAuth } = require('../src/middleware/auth');

const router = express.Router();

router.get('/dashboard', requireAuth, reinscriptionController.schoolPage);
router.get('/stats/:schoolId', requireAuth, reinscriptionController.stats);
router.get('/causes/:schoolId/:schoolYear', requireAuth, reinscriptionController.causes);
router.get('/causes/export/:schoolId.pdf', requireAuth, reinscriptionController.exportCausesPdf);
router.get('/causes/export/:schoolId.xlsx', requireAuth, reinscriptionController.exportCausesExcel);
router.get('/group/causes/:groupId/:schoolYear', requireAuth, reinscriptionController.groupCauses);
router.get('/group/:groupId/dashboard', requireAuth, reinscriptionController.groupDashboard);
router.get('/group/causes/export/:groupId.pdf', requireAuth, reinscriptionController.exportGroupCausesPdf);
router.get('/group/causes/export/:groupId.xlsx', requireAuth, reinscriptionController.exportGroupCausesExcel);
router.post('/:studentId', requireAuth, reinscriptionController.reEnroll);
router.get('/export/:schoolId.pdf', requireAuth, reinscriptionController.exportPdf);
router.get('/export/:schoolId.xlsx', requireAuth, reinscriptionController.exportExcel);

module.exports = router;
