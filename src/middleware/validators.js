const { body, validationResult } = require('express-validator');
const { safeBack } = require('../utils/cookies');

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors.array().map((e) => e.msg).join('. ');
    if (req.accepts('html')) {
      const role = req.body.role || 'parent';
      if (req.path.includes('register')) {
        return res.status(400).render('auth/register', { error: message, role });
      }
      if (req.path.includes('login')) {
        return res.status(400).render('auth/login', { error: message, role });
      }
      const back = safeBack(req);
      return res.redirect(`${back}${back.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
    }
    return res.status(400).json({ error: message, details: errors.array() });
  }
  return next();
}

const loginRules = [
  body('email').trim().isEmail().withMessage('Email invalide'),
  body('password').notEmpty().withMessage('Mot de passe requis'),
];

const registerRules = [
  body('email').trim().isEmail().withMessage('Email invalide'),
  body('password').isLength({ min: 8 }).withMessage('Mot de passe : 8 caractères minimum'),
  body('firstName').trim().notEmpty().withMessage('Prénom requis'),
  body('lastName').trim().notEmpty().withMessage('Nom requis'),
  body('role').isIn(['SCHOOL_ADMIN', 'PARENT', 'TEACHER']).withMessage('Rôle invalide'),
];

const schoolAdminRegisterRules = [
  body('schoolName').if(body('role').equals('SCHOOL_ADMIN')).trim().notEmpty().withMessage('Nom école requis'),
];

const teacherRegisterRules = [
  body('schoolCode').if(body('role').equals('TEACHER')).trim().notEmpty().withMessage('Code école requis'),
];

const studentRules = [
  body('firstName').trim().notEmpty().withMessage('Prénom requis'),
  body('lastName').trim().notEmpty().withMessage('Nom requis'),
  body('classId').notEmpty().withMessage('Classe requise'),
];

const classRules = [
  body('name').trim().notEmpty().withMessage('Nom de classe requis'),
  body('level').trim().notEmpty().withMessage('Niveau requis'),
];

const feeRules = [
  body('name').trim().notEmpty().withMessage('Nom du frais requis'),
  body('amount').isInt({ min: 100 }).withMessage('Montant invalide'),
];

const addChildRules = [
  body('schoolCode').trim().notEmpty().withMessage('Code école requis'),
  body('matricule').trim().notEmpty().withMessage('Matricule requis'),
  body('lastName').trim().notEmpty().withMessage('Nom de famille de l\'élève requis'),
];

const teacherInviteRules = [
  body('email').trim().isEmail().withMessage('Email invalide'),
  body('firstName').trim().notEmpty().withMessage('Prénom requis'),
  body('lastName').trim().notEmpty().withMessage('Nom requis'),
];

module.exports = {
  handleValidationErrors,
  loginRules,
  registerRules,
  schoolAdminRegisterRules,
  teacherRegisterRules,
  studentRules,
  classRules,
  feeRules,
  addChildRules,
  teacherInviteRules,
};
