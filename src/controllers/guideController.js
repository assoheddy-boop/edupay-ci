const { listGuides, getGuideMeta, loadMarkdown, markdownToHtml, pdfPath } = require('../utils/guideMarkdown');
const fs = require('fs');

function index(_req, res) {
  res.render('guides/index', {
    user: null,
    title: 'Guides EduConnect',
    guides: listGuides(),
    guideCurrent: 'index',
  });
}

function show(req, res) {
  const slug = req.params.slug;
  const loaded = loadMarkdown(slug);
  if (!loaded) {
    return res.status(404).render('error', { message: 'Guide introuvable', user: null });
  }
  res.render('guides/show', {
    user: null,
    title: loaded.title,
    slug: loaded.slug,
    html: markdownToHtml(loaded.markdown),
    guideCurrent: loaded.slug,
  });
}

function pdf(req, res) {
  const slug = String(req.params.slug || '').replace(/\.pdf$/i, '');
  const meta = getGuideMeta(slug);
  if (!meta) {
    return res.status(404).render('error', { message: 'Guide introuvable', user: null });
  }
  const file = pdfPath(slug);
  if (!file || !fs.existsSync(file)) {
    return res.status(404).render('error', { message: 'PDF du guide indisponible', user: null });
  }
  res.download(file, meta.pdf);
}

module.exports = { index, show, pdf };
