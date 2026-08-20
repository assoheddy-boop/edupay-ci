const express = require('express');
const schoolController = require('../controllers/schoolController');
const studentSituationController = require('../controllers/studentSituationController');
const agfneImportController = require('../controllers/agfneImportController');
const messageController = require('../controllers/messageController');
const statsController = require('../controllers/statsController');
const accountingController = require('../controllers/accountingController');
const extras = require('../controllers/extrasController');
const hrController = require('../controllers/hrController');
const classController = require('../controllers/classController');
const schoolAnalyseController = require('../controllers/schoolAnalyseController');
const deliberationController = require('../controllers/deliberationController');
const socialCaseController = require('../controllers/socialCaseController');
const riskController = require('../controllers/riskController');
const emargementController = require('../controllers/emargementController');
const convocationController = require('../controllers/convocationController');
const palmaresController = require('../controllers/palmaresController');
const justificationController = require('../controllers/justificationController');
const schoolPortalController = require('../controllers/schoolPortalController');
const { requireAuth, checkRole } = require('../middleware/auth');
const { requirePremium } = require('../middleware/premium');
const { attachModules, requireModule } = require('../middleware/modules');
const { requirePermission } = require('../middleware/requirePermission');
const { PERMISSIONS: P } = require('../utils/staffPermissions');
const { uploadLimiter } = require('../middleware/rateLimit');
const { auditMiddleware } = require('../utils/audit');
const { csrfProtection } = require('../middleware/csrfProtection');
const {
  handleValidationErrors,
  studentRules,
  classRules,
  feeRules,
  teacherInviteRules,
} = require('../middleware/validators');
const upload = require('../middleware/upload');
const csvUpload = upload.csvUpload;
const { persistUpload } = upload;

const router = express.Router();

router.use(requireAuth, checkRole('school'), attachModules, csrfProtection);

router.get('/dashboard', requirePermission(P.DASHBOARD), schoolController.dashboard);
router.get('/analyse', requirePermission(P.STATS), schoolAnalyseController.analysePage);
router.get('/risques', requirePermission(P.STATS), riskController.risquesPage);
router.get('/emargements', requirePermission(P.EMARGEMENTS), emargementController.emargementsPage);
router.get('/emargements/imprimer', requirePermission(P.EMARGEMENTS), emargementController.emargementsPrint);
router.get('/emargements.pdf', requirePermission(P.EMARGEMENTS), emargementController.emargementsPdf);
router.get('/convocations', requirePermission(P.CONVOCATIONS), convocationController.convocationsPage);
router.post('/convocations', requirePermission(P.CONVOCATIONS), auditMiddleware('convocation_create', 'ExamSession'), convocationController.createConvocation);
router.get('/convocations/:id/imprimer', requirePermission(P.CONVOCATIONS), convocationController.convocationPrint);
router.get('/convocations/:id/pdf', requirePermission(P.CONVOCATIONS), convocationController.convocationPdf);
router.get('/convocations/:id.pdf', requirePermission(P.CONVOCATIONS), convocationController.convocationPdf);
router.get('/convocations/:id', requirePermission(P.CONVOCATIONS), convocationController.convocationDetail);
router.get('/justificatifs', requireModule('absences'), requirePermission(P.ABSENCES), justificationController.schoolPage);
router.post('/justificatifs/:id/review', requireModule('absences'), requirePermission(P.ABSENCES), auditMiddleware('justification_review', 'AbsenceJustification'), justificationController.review);
router.get('/settings', requirePermission(P.SETTINGS_READ), schoolController.settings);
router.post('/settings', requirePermission(P.SETTINGS_WRITE), upload.logoUpload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'secondaryLogo', maxCount: 1 },
  { name: 'directorSignature', maxCount: 1 },
  { name: 'directorStamp', maxCount: 1 },
  { name: 'banner', maxCount: 1 },
  { name: 'gallery', maxCount: 8 },
]), auditMiddleware('school_settings_update', 'School'), schoolController.updateSettings);
router.get('/marketplace-renewal', requirePermission(P.SETTINGS_READ), schoolController.marketplaceRenewalPage);
router.get('/marketplace-renewal/pay', requirePermission(P.SETTINGS_WRITE), schoolController.marketplaceRenewalPay);
router.get('/portail', requirePermission(P.PORTAL), schoolPortalController.page);
router.post('/portail/news', requirePermission(P.PORTAL), auditMiddleware('portal_post_create', 'PortalPost'), schoolPortalController.createNews);
router.post('/portail/news/:id/delete', requirePermission(P.PORTAL), auditMiddleware('portal_post_delete', 'PortalPost'), schoolPortalController.deleteNews);
router.get('/coefficients', requirePermission(P.COEFFICIENTS), schoolController.coefficientsPage);
router.post('/coefficients', requirePermission(P.COEFFICIENTS), auditMiddleware('coefficients_update', 'Subject'), schoolController.updateCoefficients);
router.get('/sms', requirePermission(P.SMS), schoolController.smsDashboard);

router.get('/staff-roles', requirePermission(P.SETTINGS_WRITE), schoolController.staffRolesPage);
router.post('/staff-roles', requirePermission(P.SETTINGS_WRITE), auditMiddleware('staff_role_assign', 'SchoolStaffAssignment'), schoolController.assignStaffRole);
router.post('/staff-roles/:id/delete', requirePermission(P.SETTINGS_WRITE), auditMiddleware('staff_role_remove', 'SchoolStaffAssignment'), schoolController.removeStaffRole);

router.get('/classes', requirePermission(P.CLASSES_READ), schoolController.listClasses);
router.post('/classes', requirePermission(P.CLASSES_WRITE), classRules, handleValidationErrors, auditMiddleware('class_create', 'Class'), schoolController.createClass);
router.get('/classes/:id/dashboard', requirePermission(P.CLASSES_READ), classController.dashboard);
router.get('/classes/:id/export/gender.xlsx', requirePermission(P.CLASSES_READ), classController.exportExcel);
router.get('/classes/:id/export/gender.pdf', requirePermission(P.CLASSES_READ), classController.exportPdf);
router.get('/classes/:id', requirePermission(P.CLASSES_READ), classController.dashboard);
router.post('/classes/:id/update', requirePermission(P.CLASSES_WRITE), classRules, handleValidationErrors, schoolController.updateClass);
router.post('/classes/:id/delete', requirePermission(P.CLASSES_WRITE), schoolController.deleteClass);

router.get('/students', requirePermission(P.STUDENTS_READ), schoolController.listStudents);
router.get('/students/:id', requirePermission(P.STUDENTS_READ), studentSituationController.showPage);

router.get('/inscriptions', requirePermission(P.ENROLLMENTS_READ), enrollmentController.listPage);
router.get('/inscriptions/recherche', requirePermission(P.ENROLLMENTS_READ), enrollmentController.searchMen);
router.get('/inscriptions/nouvelle', requirePermission(P.ENROLLMENTS_WRITE), enrollmentController.newPage);
router.post('/inscriptions', requirePermission(P.ENROLLMENTS_WRITE), upload.logoUpload.single('photo'), auditMiddleware('enrollment_create', 'StudentEnrollment'), enrollmentController.create);
router.get('/inscriptions/effectif', requirePermission(P.ENROLLMENTS_READ), enrollmentController.classEffectif);
router.get('/inscriptions/:studentId/fiche.pdf', requirePermission(P.ENROLLMENTS_READ), enrollmentController.fichePdf);
router.get('/inscriptions/:studentId/certificat-scolarite.pdf', requirePermission(P.CERTIFICATES), enrollmentController.certificatScolaritePdf);
router.get('/inscriptions/:studentId/attestation-inscription.pdf', requirePermission(P.CERTIFICATES), enrollmentController.attestationInscriptionPdf);
router.get('/inscriptions/:studentId', requirePermission(P.ENROLLMENTS_READ), enrollmentController.editPage);
router.post('/inscriptions/:studentId', requirePermission(P.ENROLLMENTS_WRITE), upload.logoUpload.single('photo'), auditMiddleware('enrollment_update', 'StudentEnrollment'), enrollmentController.update);

router.get('/enrollment/agfne-import', requirePermission(P.ENROLLMENTS_READ), agfneImportController.page);
router.post('/enrollment/agfne-import/preview', requirePermission(P.ENROLLMENTS_WRITE), csvUpload.single('file'), auditMiddleware('agfne_import_preview', 'AgfneImportLog'), agfneImportController.preview);
router.post('/enrollment/agfne-import/confirm', requirePermission(P.ENROLLMENTS_WRITE), auditMiddleware('agfne_import_confirm', 'AgfneImportLog'), agfneImportController.confirm);
router.post('/enrollment/agfne-import/cancel', requirePermission(P.ENROLLMENTS_WRITE), agfneImportController.cancel);

router.get('/students/import/template', requirePermission(P.STUDENTS_WRITE), schoolController.downloadStudentImportTemplate);
router.post('/students/import', requirePermission(P.STUDENTS_WRITE), csvUpload.single('csv'), schoolController.importStudents);
router.post('/students', requirePermission(P.STUDENTS_WRITE), upload.logoUpload.single('photo'), studentRules, handleValidationErrors, auditMiddleware('student_create', 'Student'), schoolController.createStudent);
router.post('/students/:id/update', requirePermission(P.STUDENTS_WRITE), upload.logoUpload.single('photo'), studentRules, handleValidationErrors, schoolController.updateStudent);
router.post('/students/:id/delete', requirePermission(P.STUDENTS_WRITE), auditMiddleware('student_delete', 'Student'), schoolController.deleteStudent);
router.post('/students/:id/account', requirePermission(P.STUDENTS_WRITE), schoolController.createStudentAccount);

router.get('/teachers', requirePermission(P.TEACHERS_READ), schoolController.listTeachers);
router.post('/teachers/invite', requirePermission(P.TEACHERS_WRITE), upload.logoUpload.single('photo'), teacherInviteRules, handleValidationErrors, schoolController.inviteTeacher);
router.post('/teachers/:teacherId/photo', requirePermission(P.TEACHERS_WRITE), upload.logoUpload.single('photo'), schoolController.updateTeacherPhoto);
router.post('/teachers/:teacherId/classes', requirePermission(P.TEACHERS_WRITE), schoolController.assignTeacherClass);

router.get('/school-year', requirePermission(P.SCHOOL_YEAR), schoolController.schoolYearPage);
router.post('/school-year', requirePermission(P.SCHOOL_YEAR), schoolController.updateSchoolYear);
router.post('/school-year/promote', requirePermission(P.SCHOOL_YEAR), schoolController.promoteClass);

router.get('/timetable', (_req, res) => res.redirect('/timetable'));

router.get('/homeworks', requireModule('homeworks'), requirePermission(P.CLASSES_READ), schoolController.homeworksPage);
router.get('/homeworks/export.xlsx', requireModule('homeworks'), requirePermission(P.CLASSES_READ), schoolController.exportHomeworksExcel);
router.get('/homeworks/export.pdf', requireModule('homeworks'), requirePermission(P.CLASSES_READ), schoolController.exportHomeworksPdf);
router.get('/assessments', requireModule('homeworks'), requirePermission(P.CLASSES_READ), schoolController.homeworksPage);

router.get('/fees', requirePermission(P.FEES_READ), statsController.feesPage);
router.post('/fees', requirePermission(P.FEES_WRITE), feeRules, handleValidationErrors, statsController.createFee);
router.post('/fees/:id/update', requirePermission(P.FEES_WRITE), feeRules, handleValidationErrors, statsController.updateFee);
router.post('/fees/:id/delete', requirePermission(P.FEES_WRITE), statsController.deleteFee);

router.get('/payments', requireModule('payments'), requirePermission(P.PAYMENTS_READ), schoolController.listPayments);
router.post('/payments/:id/validate', requireModule('payments'), requirePermission(P.PAYMENTS_WRITE), auditMiddleware('payment_validate', 'Payment'), schoolController.validatePayment);
router.get('/caisse', requireModule('payments'), requirePermission(P.CAISSE), schoolController.caissePage);
router.post('/caisse', requireModule('payments'), requirePermission(P.CAISSE), auditMiddleware('caisse_encaisser', 'Payment'), schoolController.createCaisseEntry);
router.get('/caisse/:id/ticket', requireModule('payments'), requirePermission(P.CAISSE), schoolController.caisseTicket);

router.get('/cas-sociaux', requirePermission(P.SOCIAL_CASES), socialCaseController.listPage);
router.post('/cas-sociaux', requirePermission(P.SOCIAL_CASES), auditMiddleware('social_case_create', 'SocialCase'), socialCaseController.createSocialCase);
router.post('/cas-sociaux/:id/close', requirePermission(P.SOCIAL_CASES), auditMiddleware('social_case_close', 'SocialCase'), socialCaseController.closeSocialCase);

router.get('/bulletins', requireModule('bulletins'), requirePremium('Bulletins PDF'), requirePermission(P.BULLETINS_READ), schoolController.listBulletins);
router.post('/bulletins/generate', requireModule('bulletins'), requirePremium('Bulletins PDF'), requirePermission(P.BULLETINS_WRITE), schoolController.generateBulletin);
router.post('/bulletins/bulk', requireModule('bulletins'), requirePremium('Bulletins PDF'), requirePermission(P.BULLETINS_WRITE), schoolController.generateBulkBulletin);
router.get('/deliberations', requireModule('bulletins'), requirePermission(P.DELIBERATIONS), deliberationController.deliberationsPage);
router.post('/deliberations', requireModule('bulletins'), requirePermission(P.DELIBERATIONS), auditMiddleware('deliberation_save', 'Deliberation'), deliberationController.saveDeliberations);
router.get('/deliberations/pv', requireModule('bulletins'), requirePermission(P.DELIBERATIONS), deliberationController.deliberationsPv);
router.get('/deliberations/pv.pdf', requireModule('bulletins'), requirePermission(P.DELIBERATIONS), deliberationController.deliberationsPvPdf);
router.get('/palmares', requireModule('bulletins'), requirePermission(P.PALMARES), palmaresController.palmaresPage);
router.get('/palmares/imprimer', requireModule('bulletins'), requirePermission(P.PALMARES), palmaresController.palmaresPrint);
router.get('/palmares.pdf', requireModule('bulletins'), requirePermission(P.PALMARES), palmaresController.palmaresPdf);

router.get('/messages', requireModule('chat'), requirePremium('Chat'), requirePermission(P.MESSAGES), messageController.inbox);
router.get('/messages/:partnerId', requireModule('chat'), requirePremium('Chat'), requirePermission(P.MESSAGES), messageController.chat);
router.post('/messages/:partnerId', requireModule('chat'), requirePremium('Chat'), requirePermission(P.MESSAGES), uploadLimiter, upload.chatUpload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'attachment', maxCount: 1 },
]), persistUpload('chat'), messageController.send);

router.get('/stats', requireModule('stats'), requirePremium('Statistiques'), requirePermission(P.STATS), statsController.statsPage);
router.get('/export/students', requireModule('stats'), requirePremium('Export Excel'), requirePermission(P.STATS), statsController.exportStudents);
router.get('/export/payments', requireModule('stats'), requirePremium('Export Excel'), requirePermission(P.STATS), statsController.exportPayments);
router.get('/export/grades', requireModule('stats'), requirePremium('Export Excel'), requirePermission(P.STATS), statsController.exportGrades);
router.get('/export/stats', requireModule('stats'), requirePremium('Export Excel'), requirePermission(P.STATS), statsController.exportStats);
router.get('/bulletins/download/:studentId', requireModule('bulletins'), requirePremium('Bulletins PDF'), requirePermission(P.BULLETINS_READ), schoolController.downloadBulletinPdf);
router.get('/bulletins/preview/:studentId', requireModule('bulletins'), requirePremium('Bulletins PDF'), requirePermission(P.BULLETINS_READ), schoolController.previewBulletin);
router.get('/export/bulletin/:studentId', requireModule('bulletins'), requirePremium('Bulletins PDF'), requirePermission(P.CERTIFICATES), schoolController.exportBulletinPdf);

router.get('/accounting', requireModule('accounting'), requirePermission(P.ACCOUNTING_READ), accountingController.dashboard);
router.post('/accounting/transaction', requireModule('accounting'), requirePermission(P.ACCOUNTING_WRITE), accountingController.addTransaction);
router.post('/accounting/accounts', requireModule('accounting'), requirePermission(P.ACCOUNTING_WRITE), accountingController.createAccount);
router.post('/accounting/accounts/:id', requireModule('accounting'), requirePermission(P.ACCOUNTING_WRITE), accountingController.updateAccount);
router.post('/accounting/categories', requireModule('accounting'), requirePermission(P.ACCOUNTING_WRITE), accountingController.createCategory);
router.post('/accounting/categories/:id', requireModule('accounting'), requirePermission(P.ACCOUNTING_WRITE), accountingController.updateCategory);
router.post('/accounting/invoices', requireModule('accounting'), requirePermission(P.ACCOUNTING_WRITE), accountingController.createInvoice);
router.post('/accounting/invoices/:id/pay', requireModule('accounting'), requirePermission(P.ACCOUNTING_WRITE), accountingController.payInvoice);
router.post('/accounting/invoices/:id/cancel', requireModule('accounting'), requirePermission(P.ACCOUNTING_WRITE), accountingController.cancelInvoice);
router.post('/accounting/budget', requireModule('accounting'), requirePermission(P.ACCOUNTING_WRITE), accountingController.saveBudgetLine);
router.get('/accounting/report', requireModule('accounting'), requirePermission(P.ACCOUNTING_READ), accountingController.report);
router.get('/accounting/report.xlsx', requireModule('accounting'), requirePermission(P.ACCOUNTING_READ), accountingController.exportExcel);
router.get('/accounting/report.pdf', requireModule('accounting'), requirePermission(P.ACCOUNTING_READ), accountingController.exportPdf);

router.get('/canteen', requireModule('canteen'), requirePermission(P.CANTEEN), extras.schoolCanteenPage);
router.post('/canteen', requireModule('canteen'), requirePermission(P.CANTEEN), extras.createCanteenMenu);
router.get('/lost-items', requireModule('lost_items'), requirePermission(P.LOST_ITEMS), extras.schoolLostItemsPage);
router.post('/lost-items', requireModule('lost_items'), requirePermission(P.LOST_ITEMS), upload.single('photo'), persistUpload('lost-items'), extras.createLostItem);
router.post('/lost-items/:id/claim', requireModule('lost_items'), requirePermission(P.LOST_ITEMS), extras.claimLostItem);
router.get('/activities', requireModule('activities'), requirePermission(P.ACTIVITIES), extras.schoolActivitiesPage);
router.post('/activities', requireModule('activities'), requirePermission(P.ACTIVITIES), extras.createActivity);
router.get('/pickup', requireModule('pickup'), requirePermission(P.PICKUP), extras.schoolPickupPage);
router.post('/pickup/validate', requireModule('pickup'), requirePermission(P.PICKUP), extras.validatePickup);

router.get('/hr', requireModule('hr'), requirePermission(P.HR_READ), hrController.dashboard);
router.get('/hr/staff', requireModule('hr'), requirePermission(P.HR_READ), hrController.staffList);
router.get('/hr/staff/new', requireModule('hr'), requirePermission(P.HR_WRITE), hrController.newStaffForm);
router.post('/hr/staff/new', requireModule('hr'), requirePermission(P.HR_WRITE), hrController.createStaffMember);
router.get('/hr/staff/p/:profileId', requireModule('hr'), requirePermission(P.HR_READ), hrController.staffProfileDetail);
router.post('/hr/staff/p/:profileId', requireModule('hr'), requirePermission(P.HR_WRITE), hrController.updateStaffProfileById);
router.get('/hr/staff/:id', requireModule('hr'), requirePermission(P.HR_READ), hrController.staffDetail);
router.post('/hr/staff/:id', requireModule('hr'), requirePermission(P.HR_WRITE), upload.logoUpload.single('photo'), hrController.updateStaffProfile);
router.post('/hr/staff/:id/documents', requireModule('hr'), requirePermission(P.HR_WRITE), upload.hrDocUpload.single('document'), hrController.uploadStaffDocument);
router.get('/hr/leaves', requireModule('hr'), requirePermission(P.HR_READ), hrController.leavesPage);
router.post('/hr/leaves/:id/review', requireModule('hr'), requirePermission(P.HR_WRITE), hrController.reviewLeave);
router.get('/hr/attendance', requireModule('hr'), requirePermission(P.HR_READ), hrController.attendancePage);
router.post('/hr/attendance', requireModule('hr'), requirePermission(P.HR_WRITE), hrController.updateAttendance);
router.get('/hr/payroll', requireModule('hr'), requirePermission(P.HR_READ), hrController.payrollPage);
router.get('/hr/rubriques-paie', requireModule('hr'), requirePermission(P.ACCOUNTING_WRITE), hrController.payRubriquesPage);
router.post('/hr/rubriques-paie', requireModule('hr'), requirePermission(P.ACCOUNTING_WRITE), hrController.savePayRubriques);
router.post('/hr/payroll/generate', requireModule('hr'), requirePermission(P.HR_WRITE), hrController.generatePayrollAction);
router.post('/hr/payroll/pay', requireModule('hr'), requirePermission(P.HR_WRITE), hrController.payPayrollAction);
router.post('/hr/payroll/payslips/:id', requireModule('hr'), requirePermission(P.HR_WRITE), hrController.updatePayslip);
router.get('/hr/payslip/:id/pdf', requireModule('hr'), requirePermission(P.HR_READ), hrController.exportPayslipPdf);
router.get('/hr/payslip/:id/preview', requireModule('hr'), requirePermission(P.HR_READ), hrController.payslipPreview);
router.post('/hr/advances/:id/review', requireModule('hr'), requirePermission(P.HR_WRITE), hrController.reviewAdvance);
router.get('/hr/evaluations', requireModule('hr'), requirePermission(P.HR_READ), hrController.evaluationsPage);
router.post('/hr/evaluations', requireModule('hr'), requirePermission(P.HR_WRITE), hrController.saveEvaluation);
router.get('/hr/export/payroll', requireModule('hr'), requirePermission(P.HR_READ), hrController.exportPayroll);
router.get('/hr/export/leaves', requireModule('hr'), requirePermission(P.HR_READ), hrController.exportLeaves);
router.get('/hr/export/attendance', requireModule('hr'), requirePermission(P.HR_READ), hrController.exportAttendance);
router.get('/hr/export/payslip/:teacherId', requireModule('hr'), requirePermission(P.HR_READ), hrController.exportPayslipPdf);

module.exports = router;
