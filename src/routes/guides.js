const express = require('express');
const guideController = require('../controllers/guideController');

const router = express.Router();

router.get('/guides', guideController.index);
router.get('/guide', (_req, res) => res.redirect('/guides'));
router.get('/guide/:slug', (req, res, next) => {
  if (/\.pdf$/i.test(req.params.slug)) {
    req.params.slug = req.params.slug.replace(/\.pdf$/i, '');
    return guideController.pdf(req, res, next);
  }
  return guideController.show(req, res, next);
});

module.exports = router;
