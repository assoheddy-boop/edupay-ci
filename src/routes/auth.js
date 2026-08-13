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

const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/logout', authController.logout);

router.post('/logout', authController.logout);

router.post('/photo', requireAuth, upload.logoUpload.single('photo'), authController.uploadPhoto);



module.exports = router;

