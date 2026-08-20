const { sendEmail } = require('../services/email');
const { ensureCsrfToken, requireCsrf } = require('../utils/csrf');
const { parseEducationCycle, CYCLE_LABELS } = require('../utils/educationCycle');
const { safeJson } = require('../utils/safeJson');
const { findSeoLanding } = require('../config/marketplaceSeoRoutes');
const {
  SITE_ORIGIN,
  CONTACT_INBOX,
  PRIVATE_ROBOTS,
  PUBLIC_ROBOTS,
  isPortalSlug,
  portalPath,
  organizationPortalPath,
  seoForSchool,
  seoForMarketplace,
  jsonLdForSchool,
  jsonLdForMarketplace,
  sanitizeContact,
  publicSchoolView,
  cycleFilterOptions,
  typeFilterOptions,
  parsePublicType,
} = require('../utils/publicPortal');
const {
  findPublishedSchool,
  findPublishedOrganization,
  listPublishedSchools,
  listFeaturedSchools,
  listPortalPosts,
  buildSitemapXml,
  fallbackSitemapXml,
} = require('../services/marketplace');
const { publicSchoolStats } = require('../services/publicPortalStats');
const { recordPortalEvent } = require('../services/portalAnalytics');

function renderMissing(res, status = 404, message) {
  res.setHeader('X-Robots-Tag', PRIVATE_ROBOTS);
  return res.status(status).render('error', {
    message: message || 'Cette école n’a pas publié de page, ou le lien est incorrect.',
    user: null,
    title: 'Page introuvable',
    robots: PRIVATE_ROBOTS,
  });
}

async function schoolPageLocals(req, res, school, extra = {}) {
  const posts = extra.posts || await listPortalPosts(school.id);
  const stats = extra.stats || await publicSchoolStats(school.id);
  const view = publicSchoolView(school, {
    classCount: school._count?.classes ?? null,
  });
  const seo = seoForSchool(school, { posts });
  const jsonLd = jsonLdForSchool(school, { posts });
  return {
    user: null,
    school: view,
    posts,
    stats,
    title: seo.title,
    metaDescription: seo.metaDescription,
    canonicalUrl: seo.canonicalUrl,
    ogTitle: seo.ogTitle,
    ogDescription: seo.ogDescription,
    ogImage: seo.ogImage,
    jsonLd,
    jsonLdJson: safeJson(jsonLd),
    robots: PUBLIC_ROBOTS,
    portalCss: true,
    csrfToken: ensureCsrfToken(req, res),
    contactError: extra.contactError || null,
    contactSuccess: extra.contactSuccess || false,
    contactValues: extra.contactValues || {},
  };
}

function marketplaceHasActiveFilters(filters = {}) {
  return Boolean(
    String(filters.q || '').trim()
    || String(filters.ville || '').trim()
    || String(filters.commune || '').trim()
    || String(filters.cycle || '').trim()
    || String(filters.type || '').trim(),
  );
}

async function renderMarketplaceListing(req, res, filters, seoExtra = {}) {
  const schools = await listPublishedSchools(filters);
  const seo = seoForMarketplace(seoExtra);
  if (seoExtra.canonicalPath) {
    seo.canonicalUrl = `${SITE_ORIGIN}${seoExtra.canonicalPath}`;
  }
  const views = schools.map((row) => publicSchoolView(row, { includeBase64: false }));
  const jsonLd = jsonLdForMarketplace(views, seo);
  const hasActiveFilters = marketplaceHasActiveFilters(filters);
  const featuredSchools = hasActiveFilters ? [] : await listFeaturedSchools(3);
  return res.render('portal/marketplace', {
    user: null,
    title: seo.title,
    heading: seo.heading,
    lead: seo.lead,
    metaDescription: seo.metaDescription,
    canonicalUrl: seo.canonicalUrl,
    ogTitle: seo.ogTitle,
    ogDescription: seo.ogDescription,
    ogImage: seo.ogImage,
    jsonLd,
    jsonLdJson: safeJson(jsonLd),
    robots: PUBLIC_ROBOTS,
    portalCss: true,
    ville: filters.ville || '',
    commune: filters.commune || '',
    cycle: filters.cycle || '',
    type: filters.type || '',
    q: filters.q || '',
    cycleOptions: cycleFilterOptions(),
    typeOptions: typeFilterOptions(),
    cycleLabels: CYCLE_LABELS,
    schools: views,
    schoolCount: views.length,
    featuredSchools,
    hasActiveFilters,
    verifiedLanding: Boolean(seoExtra.verifiedLanding),
  });
}

async function schoolPage(req, res, next) {
  try {
    const school = await findPublishedSchool(req.params.slug);
    if (!school) return renderMissing(res);
    await recordPortalEvent(school.id, 'view');
    return res.render('portal/school', await schoolPageLocals(req, res, school));
  } catch (err) {
    return next(err);
  }
}

async function goPayer(req, res, next) {
  try {
    const school = await findPublishedSchool(req.params.slug);
    if (!school) return renderMissing(res);
    await recordPortalEvent(school.id, 'pay');
    return res.redirect('/auth/login');
  } catch (err) {
    return next(err);
  }
}

async function goConnexion(req, res, next) {
  try {
    const school = await findPublishedSchool(req.params.slug);
    if (!school) return renderMissing(res);
    await recordPortalEvent(school.id, 'login');
    return res.redirect('/auth/login');
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
      return res.render('portal/school', await schoolPageLocals(req, res, school, { contactSuccess: true }));
    }
    if (!parsed.ok) {
      return res.status(400).render('portal/school', await schoolPageLocals(req, res, school, {
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
    await recordPortalEvent(school.id, 'contact');

    return res.render('portal/school', await schoolPageLocals(req, res, school, { contactSuccess: true }));
  } catch (err) {
    return next(err);
  }
}

async function marketplace(req, res, next) {
  try {
    const q = String(req.query.q || '').trim();
    const ville = String(req.query.ville || req.query.city || '').trim();
    const commune = String(req.query.commune || '').trim();
    const cycleRaw = String(req.query.cycle || '').trim();
    const cycle = cycleRaw && parseEducationCycle(cycleRaw) === cycleRaw.toUpperCase()
      ? cycleRaw.toUpperCase()
      : '';
    const type = parsePublicType(req.query.type) || '';
    return renderMarketplaceListing(
      req,
      res,
      { q, ville, commune, cycle, type },
      { q, ville, commune, cycle, type },
    );
  } catch (err) {
    return next(err);
  }
}

async function verifiedMarketplace(req, res, next) {
  try {
    const seo = seoForMarketplace({
      heading: 'Établissements vérifiés EduConnect',
      lead: 'Écoles, collèges et lycées avec vitrine Marketplace active. Badge « Vérifié » pour Premium et VIP. Aucune note nominative en public.',
    });
    seo.canonicalUrl = `${SITE_ORIGIN}/ecoles/verifies`;
    const schools = await listPublishedSchools({});
    const views = schools.map((row) => publicSchoolView(row, { includeBase64: false }));
    const jsonLd = jsonLdForMarketplace(views, seo);
    return res.render('portal/verified', {
      user: null,
      title: `${seo.heading} — Côte d’Ivoire`,
      heading: seo.heading,
      lead: seo.lead,
      metaDescription: seo.lead.slice(0, 160),
      canonicalUrl: seo.canonicalUrl,
      ogTitle: seo.heading,
      ogDescription: seo.lead.slice(0, 160),
      ogImage: `${SITE_ORIGIN}/icons/icon-192.png`,
      jsonLd,
      jsonLdJson: safeJson(jsonLd),
      robots: PUBLIC_ROBOTS,
      portalCss: true,
      schools: views,
      schoolCount: views.length,
    });
  } catch (err) {
    return next(err);
  }
}

async function marketplaceSeoLanding(req, res, next) {
  try {
    const landing = findSeoLanding(req.params.seoSlug);
    if (!landing) return next();
    return renderMarketplaceListing(
      req,
      res,
      {
        ville: landing.ville || '',
        commune: landing.commune || '',
        cycle: landing.cycle || '',
        type: landing.type || '',
      },
      {
        ville: landing.ville,
        commune: landing.commune,
        cycle: landing.cycle,
        type: landing.type,
        heading: landing.heading,
        lead: landing.lead,
        canonicalPath: `/ecoles/${landing.slug}`,
      },
    );
  } catch (err) {
    return next(err);
  }
}

async function organizationPage(req, res, next) {
  try {
    const data = await findPublishedOrganization(req.params.slug);
    if (!data) {
      return renderMissing(res, 404, 'Ce groupe scolaire n’a pas publié de vitrine, ou le lien est incorrect.');
    }
    const { organization, schools } = data;
    const views = schools.map((row) => publicSchoolView(row, { includeBase64: false }));
    const title = `${organization.name} — Groupe scolaire`;
    return res.render('portal/organization', {
      user: null,
      title,
      metaDescription: `${organization.name} : campus et établissements sur EduConnect. Notes et bulletins dans l’espace parent.`,
      canonicalUrl: `${SITE_ORIGIN}${organizationPortalPath(organization.slug)}`,
      robots: PUBLIC_ROBOTS,
      portalCss: true,
      organization: {
        name: organization.name,
        slug: organization.slug,
        city: organization.city,
        address: organization.address,
        publicDescription: organization.publicDescription,
        publicPhone: organization.publicPhone,
        logoUrl: organization.logoUrl,
        logoBase64: organization.logoBase64,
        portalPath: organizationPortalPath(organization.slug),
      },
      schools: views,
    });
  } catch (err) {
    return next(err);
  }
}

function sendSitemap(res, xml) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=1800');
  return res.status(200).send(xml);
}

async function sitemap(_req, res) {
  try {
    return sendSitemap(res, await buildSitemapXml());
  } catch (err) {
    console.error('[sitemap]', err?.message || err);
    return sendSitemap(res, fallbackSitemapXml());
  }
}

function robots(_req, res) {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Allow: /ecoles',
    'Allow: /ecoles/verifies',
    'Allow: /e/',
    'Disallow: /auth',
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
  goPayer,
  goConnexion,
  sendContact,
  marketplace,
  verifiedMarketplace,
  marketplaceSeoLanding,
  organizationPage,
  sitemap,
  robots,
  publicAlias,
  requireCsrf,
};
