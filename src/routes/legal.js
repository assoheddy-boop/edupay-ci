const express = require('express');
const legalController = require('../controllers/legalController');

const router = express.Router();

router.get('/mentions-legales', legalController.mentions);
router.get('/mentions', legalController.mentions);
router.get('/legal', legalController.mentions);

router.get('/confidentialite', legalController.privacy);
router.get('/privacy', legalController.privacy);

router.get('/cgu', legalController.terms);
router.get('/conditions', legalController.terms);

router.get('/cookies', legalController.cookies);

module.exports = router;
