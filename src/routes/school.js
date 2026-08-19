const express = require('express');
const schoolController = require('../controllers/schoolController');
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
const { requireAuth, checkRole } = require('../middleware/auth');
const { requirePremium } = require('../middleware/premium');
const { attachModules, requireModule } = require('../middleware/modules');
const { uploadLimiter } = require('../middleware/rateLimit');
const { auditMiddleware } = require('../utils/audit');
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

router.use(requireAuth, checkRole('school'), attachModules);

router.get('/dashboard', schoolController.dashboard);
router.get('/analyse', schoolAnalyseController.analysePage);
router.get('/risques', riskController.risquesPage);
router.get('/emargements', emargementController.emargementsPage);
router.get('/emargements/imprimer', emargementController.emargementsPrint);
router.get('/emargements.pdf', emargementController.emargementsPdf);
router.get('/convocations', convocationController.convocationsPage);
router.post('/convocations', auditMiddleware('convocation_create', 'ExamSession'), convocationController.createConvocation);
router.get('/convocations/:id/imprimer', convocationController.convocationPrint);
router.get('/convocations/:id/pdf', convocationController.convocationPdf);
router.get('/convocations/:id.pdf', convocationController.convocationPdf);
router.get('/convocations/:id', convocationController.convocationDetail);
router.get('/justificatifs', requireModule('absences'), justificationController.schoolPage);
router.post('/justificatifs/:id/review', requireModule('absences'), auditMiddleware('justification_review', 'AbsenceJustification'), justificationController.review);
router.get('/settings', schoolController.settings);
router.post('/settings', upload.logoUpload.single('logo'), auditMiddleware('school_settings_update', 'School'), schoolController.updateSettings);
router.get('/coefficients', schoolController.coefficientsPage);
router.post('/coefficients', auditMiddleware('coefficients_update', 'Subject'), schoolController.updateCoefficients);
router.get('/sms', schoolController.smsDashboard);

router.get('/classes', schoolController.listClasses);
router.post('/classes', classRules, handleValidationErrors, auditMiddleware('class_create', 'Class'), schoolController.createClass);
router.get('/classes/:id/dashboard', classController.dashboard);
router.get('/classes/:id/export/gender.xlsx', classController.exportExcel);
router.get('/classes/:id/export/gender.pdf', classController.exportPdf);
router.get('/classes/:id', classController.dashboard);
router.post('/classes/:id/update', classRules, handleValidationErrors, schoolController.updateClass);
router.post('/classes/:id/delete', schoolController.deleteClass);

router.get('/students', schoolController.listStudents);
router.get('/students/import/template', schoolController.downloadStudentImportTemplate);
router.post('/students/import', csvUpload.single('csv'), schoolController.importStudents);
router.post('/students', upload.logoUpload.single('photo'), studentRules, handleValidationErrors, auditMiddleware('student_create', 'Student'), schoolController.createStudent);
router.post('/students/:id/update', upload.logoUpload.single('photo'), studentRules, handleValidationErrors, schoolController.updateStudent);
router.post('/students/:id/delete', auditMiddleware('student_delete', 'Student'), schoolController.deleteStudent);

router.get('/teachers', schoolController.listTeachers);
router.post('/teachers/invite', upload.logoUpload.single('photo'), teacherInviteRules, handleValidationErrors, schoolController.inviteTeacher);
router.post('/teachers/:teacherId/photo', upload.logoUpload.single('photo'), schoolController.updateTeacherPhoto);
router.post('/teachers/:teacherId/classes', schoolController.assignTeacherClass);

router.get('/school-year', schoolController.schoolYearPage);
router.post('/school-year', schoolController.updateSchoolYear);
router.post('/school-year/promote', schoolController.promoteClass);

router.get('/timetable', (_req, res) => res.redirect('/timetable'));

router.get('/homeworks', requireModule('homeworks'), schoolController.homeworksPage);
router.get('/homeworks/export.xlsx', requireModule('homeworks'), schoolController.exportHomeworksExcel);
router.get('/homeworks/export.pdf', requireModule('homeworks'), schoolController.exportHomeworksPdf);
router.get('/assessments', requireModule('homeworks'), schoolController.homeworksPage);

router.get('/fees', statsController.feesPage);
router.post('/fees', feeRules, handleValidationErrors, statsController.createFee);
router.post('/fees/:id/update', feeRules, handleValidationErrors, statsController.updateFee);
router.post('/fees/:id/delete', statsController.deleteFee);

router.get('/payments', requireModule('payments'), schoolController.listPayments);
router.post('/payments/:id/validate', requireModule('payments'), auditMiddleware('payment_validate', 'Payment'), schoolController.validatePayment);
router.get('/caisse', requireModule('payments'), schoolController.caissePage);
router.post('/caisse', requireModule('payments'), auditMiddleware('caisse_encaisser', 'Payment'), schoolController.createCaisseEntry);
router.get('/caisse/:id/ticket', requireModule('payments'), schoolController.caisseTicket);

router.get('/cas-sociaux', socialCaseController.listPage);
router.post('/cas-sociaux', auditMiddleware('social_case_create', 'SocialCase'), socialCaseController.createSocialCase);
router.post('/cas-sociaux/:id/close', auditMiddleware('social_case_close', 'SocialCase'), socialCaseController.closeSocialCase);

router.get('/bulletins', requireModule('bulletins'), requirePremium('Bulletins PDF'), schoolController.listBulletins);
router.post('/bulletins/generate', requireModule('bulletins'), requirePremium('Bulletins PDF'), schoolController.generateBulletin);
router.post('/bulletins/bulk', requireModule('bulletins'), requirePremium('Bulletins PDF'), schoolController.generateBulkBulletin);
router.get('/deliberations', requireModule('bulletins'), deliberationController.deliberationsPage);
router.post('/deliberations', requireModule('bulletins'), auditMiddleware('deliberation_save', 'Deliberation'), deliberationController.saveDeliberations);
router.get('/deliberations/pv', requireModule('bulletins'), deliberationController.deliberationsPv);
router.get('/deliberations/pv.pdf', requireModule('bulletins'), deliberationController.deliberationsPvPdf);
router.get('/palmares', requireModule('bulletins'), palmaresController.palmaresPage);
router.get('/palmares/imprimer', requireModule('bulletins'), palmaresController.palmaresPrint);
router.get('/palmares.pdf', requireModule('bulletins'), palmaresController.palmaresPdf);

router.get('/messages', requireModule('chat'), requirePremium('Chat'), messageController.inbox);
router.get('/messages/:partnerId', requireModule('chat'), requirePremium('Chat'), messageController.chat);
router.post('/messages/:partnerId', requireModule('chat'), requirePremium('Chat'), uploadLimiter, upload.chatUpload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'attachment', maxCount: 1 },
]), persistUpload('chat'), messageController.send);

router.get('/stats', requireModule('stats'), requirePremium('Statistiques'), statsController.statsPage);
router.get('/export/students', requireModule('stats'), requirePremium('Export Excel'), statsController.exportStudents);
router.get('/export/payments', requireModule('stats'), requirePremium('Export Excel'), statsController.exportPayments);
router.get('/export/grades', requireModule('stats'), requirePremium('Export Excel'), statsController.exportGrades);
router.get('/export/stats', requireModule('stats'), requirePremium('Export Excel'), statsController.exportStats);
router.get('/export/bulletin/:studentId', requireModule('bulletins'), requirePremium('Bulletins PDF'), schoolController.exportBulletinPdf);

router.get('/accounting', requireModule('accounting'), accountingController.dashboard);
router.post('/accounting/transaction', requireModule('accounting'), accountingController.addTransaction);
router.get('/accounting/report', requireModule('accounting'), accountingController.report);
router.get('/accounting/report.xlsx', requireModule('accounting'), accountingController.exportExcel);
router.get('/accounting/report.pdf', requireModule('accounting'), accountingController.exportPdf);

router.get('/canteen', requireModule('canteen'), extras.schoolCanteenPage);
router.post('/canteen', requireModule('canteen'), extras.createCanteenMenu);
router.get('/lost-items', requireModule('lost_items'), extras.schoolLostItemsPage);
router.post('/lost-items', requireModule('lost_items'), upload.single('photo'), persistUpload('lost-items'), extras.createLostItem);
router.post('/lost-items/:id/claim', requireModule('lost_items'), extras.claimLostItem);
router.get('/activities', requireModule('activities'), extras.schoolActivitiesPage);
router.post('/activities', requireModule('activities'), extras.createActivity);
router.get('/pickup', requireModule('pickup'), extras.schoolPickupPage);
router.post('/pickup/validate', requireModule('pickup'), extras.validatePickup);

router.get('/hr', requireModule('hr'), hrController.dashboard);
router.get('/hr/staff', requireModule('hr'), hrController.staffList);
router.get('/hr/staff/:id', requireModule('hr'), hrController.staffDetail);
router.post('/hr/staff/:id', requireModule('hr'), upload.logoUpload.single('photo'), hrController.updateStaffProfile);
router.post('/hr/staff/:id/documents', requireModule('hr'), upload.hrDocUpload.single('document'), hrController.uploadStaffDocument);
router.get('/hr/leaves', requireModule('hr'), hrController.leavesPage);
router.post('/hr/leaves/:id/review', requireModule('hr'), hrController.reviewLeave);
router.get('/hr/attendance', requireModule('hr'), hrController.attendancePage);
router.post('/hr/attendance', requireModule('hr'), hrController.updateAttendance);
router.get('/hr/payroll', requireModule('hr'), hrController.payrollPage);
router.post('/hr/payroll/generate', requireModule('hr'), hrController.generatePayrollAction);
router.post('/hr/payroll/pay', requireModule('hr'), hrController.payPayrollAction);
router.post('/hr/payroll/payslips/:id', requireModule('hr'), hrController.updatePayslip);
router.post('/hr/advances/:id/review', requireModule('hr'), hrController.reviewAdvance);
router.get('/hr/evaluations', requireModule('hr'), hrController.evaluationsPage);
router.post('/hr/evaluations', requireModule('hr'), hrController.saveEvaluation);
router.get('/hr/export/payroll', requireModule('hr'), hrController.exportPayroll);
router.get('/hr/export/leaves', requireModule('hr'), hrController.exportLeaves);
router.get('/hr/export/attendance', requireModule('hr'), hrController.exportAttendance);
router.get('/hr/export/payslip/:teacherId', requireModule('hr'), hrController.exportPayslipPdf);

module.exports = router;
