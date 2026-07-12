const express = require('express');
const adminController = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditMiddleware } = require('../utils/audit');

const router = express.Router();

router.use(requireAuth, requireRole('SUPER_ADMIN'));

router.get('/dashboard', adminController.dashboard);
router.get('/schools/:id/modules', adminController.schoolModules);
router.post('/schools/:id/modules', adminController.updateSchoolModules);
router.get('/organizations', adminController.organizations);
router.post('/organizations', adminController.createOrganization);
router.post('/organizations/admins', auditMiddleware('org_admin_create', 'OrganizationAdmin'), adminController.createOrgAdmin);
router.post('/organizations/assign', adminController.assignSchoolToOrg);

module.exports = router;
