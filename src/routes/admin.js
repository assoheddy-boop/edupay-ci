const express = require('express');
const adminController = require('../controllers/adminController');
const { requireAuth, checkRole } = require('../middleware/auth');
const { auditMiddleware } = require('../utils/audit');

const router = express.Router();

router.use(requireAuth, checkRole('admin'));

router.get('/', (_req, res) => res.redirect('/admin/dashboard'));
router.get('/dashboard', adminController.dashboard);
router.post('/sms-test', adminController.sendTestSms);
router.get('/modules', adminController.modulesHub);

router.get('/schools', adminController.schoolsList);
router.get('/schools/:id', adminController.schoolDetail);
router.post('/schools/:id', auditMiddleware('school_admin_update', 'School'), adminController.updateSchool);
router.patch('/schools/:id', auditMiddleware('school_admin_update', 'School'), adminController.updateSchool);
router.get('/schools/:id/modules', adminController.schoolModules);
router.post('/schools/:id/modules', auditMiddleware('school_modules_update', 'SchoolModule'), adminController.updateSchoolModules);
router.post('/schools/:id/modules/enable-all', auditMiddleware('school_modules_enable_all', 'SchoolModule'), adminController.enableAllModules);
router.post('/schools/:id/cycle', auditMiddleware('school_cycle_update', 'School'), adminController.updateSchoolCycle);
router.patch('/schools/:id/cycle', auditMiddleware('school_cycle_update', 'School'), adminController.updateSchool);
router.post('/schools/:id/featured', auditMiddleware('school_featured_update', 'School'), adminController.updateSchoolFeatured);
router.patch('/schools/:id/featured', auditMiddleware('school_featured_update', 'School'), adminController.updateSchool);
router.post('/schools/:id/manage', adminController.startSchoolAssist);

router.get('/users', adminController.usersPage);
router.post('/users/:id/reset-password', auditMiddleware('user_password_reset', 'User'), adminController.resetUserPassword);
router.post('/users/:id/deactivate', auditMiddleware('user_deactivate', 'User'), adminController.deactivateUser);
router.post('/users/:id/activate', auditMiddleware('user_activate', 'User'), adminController.activateUser);

router.get('/quotes', adminController.quotesPage);
router.get('/quotes/:id', adminController.quoteDetail);

router.get('/marketplace', adminController.marketplacePage);
router.post('/marketplace/:id/publish', auditMiddleware('school_marketplace_publish', 'School'), adminController.publishMarketplace);
router.post('/marketplace/:id/unpublish', auditMiddleware('school_marketplace_unpublish', 'School'), adminController.unpublishMarketplace);
router.post('/marketplace/:id/tier', auditMiddleware('school_featured_update', 'School'), adminController.setMarketplaceTier);
router.post('/marketplace/:id/renew', auditMiddleware('school_marketplace_renew', 'School'), adminController.renewMarketplace);
router.post('/marketplace/bulk-renew', auditMiddleware('school_marketplace_renew', 'School'), adminController.bulkRenewMarketplace);
router.post('/marketplace/:id/featured', auditMiddleware('school_featured_update', 'School'), adminController.toggleMarketplaceFeatured);
router.post('/marketplace/:id/reminder', auditMiddleware('school_marketplace_reminder', 'School'), adminController.sendMarketplaceReminder);
router.get('/marketplace/avis', adminController.marketplaceReviewsPage);
router.post('/marketplace/avis/:id', auditMiddleware('school_review_moderate', 'SchoolReview'), adminController.moderateSchoolReview);
router.post('/modules/matrix', auditMiddleware('school_modules_matrix', 'SchoolModule'), adminController.updateModulesMatrix);
router.get('/organizations', adminController.organizations);
router.post('/organizations', adminController.createOrganization);
router.post('/organizations/admins', auditMiddleware('org_admin_create', 'OrganizationAdmin'), adminController.createOrgAdmin);
router.post('/organizations/assign', adminController.assignSchoolToOrg);
router.post('/organizations/:id/manage', adminController.startGroupAssist);
router.get('/assist/exit', adminController.exitAssist);
router.post('/assist/exit', adminController.exitAssist);

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
