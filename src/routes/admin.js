const express = require('express');
const adminController = require('../controllers/adminController');
const { requireAuth, checkRole } = require('../middleware/auth');
const { auditMiddleware } = require('../utils/audit');

const router = express.Router();

router.use(requireAuth, checkRole('admin'));

router.get('/dashboard', adminController.dashboard);
router.get('/modules', adminController.modulesHub);
router.get('/schools/:id/modules', adminController.schoolModules);
router.post('/schools/:id/modules', auditMiddleware('school_modules_update', 'SchoolModule'), adminController.updateSchoolModules);
router.post('/schools/:id/modules/enable-all', auditMiddleware('school_modules_enable_all', 'SchoolModule'), adminController.enableAllModules);
router.get('/organizations', adminController.organizations);
router.post('/organizations', adminController.createOrganization);
router.post('/organizations/admins', auditMiddleware('org_admin_create', 'OrganizationAdmin'), adminController.createOrgAdmin);
router.post('/organizations/assign', adminController.assignSchoolToOrg);

router.get('/plans', adminController.plansPage);
router.post('/plans/activate', auditMiddleware('school_plan_activate', 'School'), adminController.activatePlanModules);

module.exports = router;
