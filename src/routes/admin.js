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
router.post('/modules/matrix', auditMiddleware('school_modules_matrix', 'SchoolModule'), adminController.updateModulesMatrix);
router.get('/organizations', adminController.organizations);
router.post('/organizations', adminController.createOrganization);
router.post('/organizations/admins', auditMiddleware('org_admin_create', 'OrganizationAdmin'), adminController.createOrgAdmin);
router.post('/organizations/assign', adminController.assignSchoolToOrg);

router.get('/plans', adminController.plansPage);
router.post('/plans/activate', auditMiddleware('school_plan_activate', 'School'), adminController.activatePlanModules);
router.post('/plans/:id/modules', auditMiddleware('plan_modules_update', 'SubscriptionPlan'), adminController.updatePlanModules);

const finance = require('../controllers/adminFinanceController');
router.get('/accounting', finance.accountingPage);
router.post('/accounting/entries', auditMiddleware('accounting_entry', 'AccountingEntry'), finance.createEntry);
router.get('/finance', finance.financeDashboard);
router.post('/scholarships', auditMiddleware('scholarship_create', 'Scholarship'), finance.createScholarship);
router.post('/scholarships/:id/status', auditMiddleware('scholarship_status', 'Scholarship'), finance.reviewScholarship);

const reporting = require('../controllers/adminReportingController');
const reinscriptionController = require('../controllers/reinscriptionController');
router.get('/reporting', reporting.reportingPage);
router.get('/reporting/export/gender.xlsx', reporting.exportGenderExcel);
router.get('/reporting/export/gender.pdf', reporting.exportGenderPdf);
router.get('/reporting/export/redoublement-plan.pdf', reporting.exportRedoublementPlanPdf);
router.get('/reporting/export/redoublement-plan.xlsx', reporting.exportRedoublementPlanExcel);
router.get('/audit', reporting.auditPage);

router.get('/group/redoublement', reinscriptionController.adminGroupDashboard);
router.get('/group/:groupId/redoublement', reinscriptionController.adminGroupDashboard);

module.exports = router;
