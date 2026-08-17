const express = require('express');
const devisController = require('../controllers/devisController');
const { devisLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/devis', devisController.form);
router.post('/devis', devisLimiter, devisController.requireCsrf, devisController.create);
router.get('/devis/:id/pdf', devisController.pdf);
router.post('/devis/:id/activer', devisLimiter, devisController.requireCsrf, devisController.activate);
router.get('/devis/:id', devisController.show);

module.exports = router;
