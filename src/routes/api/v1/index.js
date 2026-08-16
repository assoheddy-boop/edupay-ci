const express = require('express');
const apiController = require('../../../controllers/apiController');
const reportingApi = require('../../../controllers/reportingApiController');
const syncController = require('../../../controllers/syncController');
const { requireAuth, requireRole } = require('../../../middleware/auth');
const { apiLimiter } = require('../../../middleware/rateLimit');

const router = express.Router();

router.use(apiLimiter, requireAuth);

router.post('/sync', syncController.syncBatch);
router.post('/sync/resolve', syncController.resolveConflict);

router.get('/students', requireRole('SCHOOL_ADMIN', 'TEACHER'), apiController.listStudents);
router.get('/students/:id', requireRole('SCHOOL_ADMIN', 'TEACHER'), apiController.getStudent);
router.get('/classes', requireRole('SCHOOL_ADMIN', 'TEACHER'), apiController.listClasses);
router.get('/notifications', apiController.listNotifications);
router.post('/notifications/:id/read', apiController.markNotificationRead);

/*
 * Reporting export for Metabase / Power BI (JSON or CSV).
 *
 * Auth: same as the rest of /api/v1 — cookie `token` or `Authorization: Bearer <jwt>`,
 * plus requireAuth + requireRole. SUPER_ADMIN sees all schools; SCHOOL_ADMIN is scoped
 * to their school. Optional query: schoolId, classId, subject, period, from, to, status,
 * format=json|csv (or Accept: text/csv).
 *
 * Examples:
 *   GET /api/v1/reporting/absences?format=csv
 *   GET /api/v1/reporting/success-rate?schoolId=<id>&subject=Maths
 *   GET /api/v1/reporting/health?from=2026-01-01&to=2026-06-30
 *   GET /api/v1/reporting/payments?status=VALIDATED
 *
 * In Metabase: New > Native query is not required — use "JSON" / "CSV" URL as a
 * database or HTTP import. In Power BI: Get data > Web, paste the JSON/CSV URL,
 * then add the Bearer header (or session cookie for interactive refresh).
 */
const reportingRoles = requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN');
router.get('/reporting/absences', reportingRoles, reportingApi.absences);
router.get('/reporting/success-rate', reportingRoles, reportingApi.successRate);
router.get('/reporting/health', reportingRoles, reportingApi.health);
router.get('/reporting/payments', reportingRoles, reportingApi.payments);

module.exports = router;
