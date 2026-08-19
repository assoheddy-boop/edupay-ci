const { sendEmail } = require('../services/email');
const { ensureCsrfToken, requireCsrf } = require('../utils/csrf');
const { parseEducationCycle, CYCLE_LABELS } = require('../utils/educationCycle');
const {
  SITE_ORIGIN,
  CONTACT_INBOX,
  isPortalSlug,
  portalPath,
  seoForSchool,
  seoForMarketplace,
  sanitizeContact,
  publicSchoolView,
  cycleFilterOptions,
} = require('../utils/publicPortal');
const {
  findPublishedSchool,
  listPublishedSchools,
  buildSitemapXml,
} = require('../services/marketplace');

function renderMissing(res, status = 404) {
  return res.status(status).render('error', {
    message: 'Cette école n’a pas publié de page, ou le lien est incorrect.',
    user: null,
    title: 'Page introuvable',
  });
}

function schoolPageLocals(req, res, school, extra = {}) {
  const view = publicSchoolView(school, {
    classCount: school._count?.classes ?? null,
  });
  const seo = seoForSchool(school);
  return {
    user: null,
    school: view,
    title: seo.title,
    metaDescription: seo.metaDescription,
    canonicalUrl: seo.canonicalUrl,
    portalCss: true,
    csrfToken: ensureCsrfToken(req, res),
    contactError: extra.contactError || null,
    contactSuccess: extra.contactSuccess || false,
    contactValues: extra.contactValues || {},
  };
}

async function schoolPage(req, res, next) {
  try {
    const school = await findPublishedSchool(req.params.slug);
    if (!school) return renderMissing(res);
    return res.render('portal/school', schoolPageLocals(req, res, school));
  } catch (err) {
    return next(err);
  }
}

async function sendContact(req, res, next) {
  try {
    const school = await findPublishedSchool(req.params.slug);
    if (!school) return renderMissing(res);

    const parsed = sanitizeContact(req.body);
    if (parsed.spam) {
      return res.render('portal/school', schoolPageLocals(req, res, school, { contactSuccess: true }));
    }
    if (!parsed.ok) {
      return res.status(400).render('portal/school', schoolPageLocals(req, res, school, {
        contactError: parsed.errors.join(' '),
        contactValues: {
          name: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
          message: parsed.message,
        },
      }));
    }

    const to = [CONTACT_INBOX];
    const schoolEmail = school.admin?.email;
    if (schoolEmail && schoolEmail.toLowerCase() !== CONTACT_INBOX) {
      to.push(schoolEmail);
    }

    const text = [
      `Message public — ${school.name} (${portalPath(school.slug)})`,
      `Nom : ${parsed.name}`,
      `E-mail : ${parsed.email}`,
      parsed.phone ? `Téléphone : ${parsed.phone}` : null,
      '',
      parsed.message,
    ].filter(Boolean).join('\n');

    await sendEmail(to.join(', '), {
      subject: `[EduConnect] Contact — ${school.name}`,
      text,
    });

    return res.render('portal/school', schoolPageLocals(req, res, school, { contactSuccess: true }));
  } catch (err) {
    return next(err);
  }
}

async function marketplace(req, res, next) {
  try {
    const ville = String(req.query.ville || req.query.city || '').trim();
    const cycleRaw = String(req.query.cycle || '').trim();
    const cycle = cycleRaw && parseEducationCycle(cycleRaw) === cycleRaw.toUpperCase()
      ? cycleRaw.toUpperCase()
      : '';
    const schools = await listPublishedSchools({ ville, cycle });
    const seo = seoForMarketplace({ ville, cycle });
    return res.render('portal/marketplace', {
      user: null,
      title: seo.title,
      metaDescription: seo.metaDescription,
      canonicalUrl: seo.canonicalUrl,
      portalCss: true,
      ville,
      cycle,
      cycleOptions: cycleFilterOptions(),
      cycleLabels: CYCLE_LABELS,
      schools: schools.map((row) => publicSchoolView(row, { includeBase64: false })),
    });
  } catch (err) {
    return next(err);
  }
}

async function sitemap(req, res, next) {
  try {
    const xml = await buildSitemapXml();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(200).send(xml);
  } catch (err) {
    return next(err);
  }
}

function robots(_req, res) {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Allow: /ecoles',
    'Allow: /e/',
    'Disallow: /school',
    'Disallow: /parent',
    'Disallow: /teacher',
    'Disallow: /admin',
    'Disallow: /group',
    'Disallow: /hr',
    'Disallow: /api/',
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    '',
  ].join('\n');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(200).send(body);
}

async function publicAlias(req, res, next) {
  const slug = req.params.slug;
  if (!isPortalSlug(slug)) return next();
  try {
    const school = await findPublishedSchool(slug);
    if (!school) return next();
    return res.redirect(301, portalPath(school.slug));
  } catch {
    return next();
  }
}

module.exports = {
  schoolPage,
  sendContact,
  marketplace,
  sitemap,
  robots,
  publicAlias,
  requireCsrf,
};
