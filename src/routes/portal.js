const express = require('express');
const portalController = require('../controllers/portalController');
const { contactLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/ecoles', portalController.marketplace);
router.get('/sitemap.xml', portalController.sitemap);
router.get('/robots.txt', portalController.robots);
router.get('/e/:slug', portalController.schoolPage);
router.post('/e/:slug/contact', contactLimiter, portalController.requireCsrf, portalController.sendContact);

module.exports = router;
