const express = require('express');
const authController = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimit');
const {
  loginRules,
  registerRules,
  schoolAdminRegisterRules,
  teacherRegisterRules,
  handleValidationErrors,
} = require('../middleware/validators');

const router = express.Router();

router.get('/login', authController.showLogin);
router.get('/register', authController.showRegister);
router.post('/login', authLimiter, loginRules, handleValidationErrors, authController.login);
router.post('/register', authLimiter, registerRules, schoolAdminRegisterRules, teacherRegisterRules, handleValidationErrors, authController.register);
router.get('/logout', authController.logout);
router.post('/logout', authController.logout);

module.exports = router;
