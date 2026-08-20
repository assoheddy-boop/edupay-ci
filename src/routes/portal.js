const express = require('express');
const portalController = require('../controllers/portalController');
const { contactLimiter, reviewLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/ecoles/verifies', portalController.verifiedMarketplace);
router.get('/ecoles/carte', portalController.marketplaceMap);
router.get('/ecoles/comparer', portalController.marketplaceCompare);
router.get('/ecoles/comparer/add', portalController.compareAdd);
router.get('/ecoles/comparer/remove', portalController.compareRemove);
router.get('/ecoles/comparer/clear', portalController.compareClear);
router.get('/ecoles/:seoSlug', portalController.marketplaceSeoLanding);
router.get('/ecoles', portalController.marketplace);
router.get('/sitemap.xml', portalController.sitemap);
router.get('/robots.txt', portalController.robots);
router.get('/e/groupe/:slug', portalController.organizationPage);
router.get('/e/:slug/go/payer', portalController.goPayer);
router.get('/e/:slug/go/connexion', portalController.goConnexion);
router.get('/e/:slug', portalController.schoolPage);
router.post('/e/:slug/contact', contactLimiter, portalController.requireCsrf, portalController.sendContact);
router.post('/e/:slug/avis', reviewLimiter, portalController.requireCsrf, portalController.submitReview);

module.exports = router;
