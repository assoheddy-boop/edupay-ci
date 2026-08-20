const express = require('express');
const portalController = require('../controllers/portalController');
const { contactLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/ecoles/verifies', portalController.verifiedMarketplace);
router.get('/ecoles/:seoSlug', portalController.marketplaceSeoLanding);
router.get('/ecoles', portalController.marketplace);
router.get('/sitemap.xml', portalController.sitemap);
router.get('/robots.txt', portalController.robots);
router.get('/e/groupe/:slug', portalController.organizationPage);
router.get('/e/:slug/go/payer', portalController.goPayer);
router.get('/e/:slug/go/connexion', portalController.goConnexion);
router.get('/e/:slug', portalController.schoolPage);
router.post('/e/:slug/contact', contactLimiter, portalController.requireCsrf, portalController.sendContact);

module.exports = router;
