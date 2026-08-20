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
  sanitizeReview,
  compareSlugsFromCookie,
  addCompareSlug,
  removeCompareSlug,
  parseCompareSlugs,
  compareSlugsParam,
  COMPARE_COOKIE,
  COMPARE_MAX,
  publicSchoolView,
  cycleFilterOptions,
  typeFilterOptions,
  parsePublicType,
  publicSchoolMapMarker,
} = require('../utils/publicPortal');
const {
  findPublishedSchool,
  findPublishedOrganization,
  listPublishedSchools,
  listPublishedSchoolsForMap,
  listDistinctCommunes,
  listDistinctCities,
  parseMarketplacePage,
  listFeaturedSchools,
  listPortalPosts,
  buildSitemapXml,
  fallbackSitemapXml,
  listApprovedReviews,
  getSchoolReviewSummary,
  createSchoolReview,
  findPublishedSchoolsBySlugs,
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

function portalPwaLocals() {
  return {
    portalPwa: true,
    manifestHref: '/manifest-marketplace.json',
    appleWebAppTitle: 'EduConnect Écoles',
  };
}

async function schoolPageLocals(req, res, school, extra = {}) {
  const posts = extra.posts || await listPortalPosts(school.id);
  const stats = extra.stats || await publicSchoolStats(school.id);
  const reviews = extra.reviews || await listApprovedReviews(school.id);
  const reviewSummary = extra.reviewSummary || await getSchoolReviewSummary(school.id);
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
    reviews,
    reviewSummary,
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
    ...portalPwaLocals(),
    csrfToken: ensureCsrfToken(req, res),
    contactError: extra.contactError || null,
    contactSuccess: extra.contactSuccess || false,
    contactValues: extra.contactValues || {},
    reviewError: extra.reviewError || null,
    reviewSuccess: extra.reviewSuccess || false,
    reviewValues: extra.reviewValues || {},
    compareSlugs: compareSlugsFromCookie(req.cookies),
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
  const page = parseMarketplacePage(req.query.page);
  const listing = await listPublishedSchools({
    ...filters,
    page,
    verifiedOnly: Boolean(seoExtra.verifiedOnly),
  });
  const seo = seoForMarketplace({
    ...filters,
    page,
    heading: seoExtra.heading,
    lead: seoExtra.lead,
    canonicalPath: seoExtra.canonicalPath,
  });
  if (seoExtra.canonicalPath && page <= 1) {
    seo.canonicalUrl = `${SITE_ORIGIN}${seoExtra.canonicalPath}`;
  }
  const views = listing.schools.map((row) => publicSchoolView(row, { includeBase64: false }));
  const jsonLd = jsonLdForMarketplace(views, seo);
  const hasActiveFilters = marketplaceHasActiveFilters(filters);
  const featuredSchools = hasActiveFilters || page > 1 ? [] : await listFeaturedSchools(3);
  const [communeOptions, cityOptions] = await Promise.all([
    listDistinctCommunes(),
    listDistinctCities(),
  ]);
  const template = seoExtra.verifiedLanding ? 'portal/verified' : 'portal/marketplace';
  const compareSlugs = compareSlugsFromCookie(req.cookies);
  return res.render(template, {
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
    ...portalPwaLocals(),
    compareSlugs,
    compareMax: COMPARE_MAX,
    ville: filters.ville || '',
    commune: filters.commune || '',
    cycle: filters.cycle || '',
    type: filters.type || '',
    q: filters.q || '',
    cycleOptions: cycleFilterOptions(),
    typeOptions: typeFilterOptions(),
    communeOptions,
    cityOptions,
    cycleLabels: CYCLE_LABELS,
    schools: views,
    schoolCount: listing.total,
    featuredSchools,
    hasActiveFilters,
    verifiedLanding: Boolean(seoExtra.verifiedLanding),
    pagination: {
      page: listing.page,
      pageSize: listing.pageSize,
      totalPages: listing.totalPages,
      total: listing.total,
    },
    paginationBasePath: seoExtra.canonicalPath || '/ecoles',
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

async function submitReview(req, res, next) {
  try {
    const school = await findPublishedSchool(req.params.slug);
    if (!school) return renderMissing(res);

    const parsed = sanitizeReview(req.body);
    if (parsed.spam) {
      return res.render('portal/school', await schoolPageLocals(req, res, school, { reviewSuccess: true }));
    }
    if (!parsed.ok) {
      return res.status(400).render('portal/school', await schoolPageLocals(req, res, school, {
        reviewError: parsed.errors.join(' '),
        reviewValues: {
          authorName: parsed.authorName,
          rating: parsed.rating,
          comment: parsed.comment,
        },
      }));
    }

    await createSchoolReview(school.id, {
      authorName: parsed.authorName,
      rating: parsed.rating,
      comment: parsed.comment,
    });

    return res.render('portal/school', await schoolPageLocals(req, res, school, { reviewSuccess: true }));
  } catch (err) {
    return next(err);
  }
}

function compareCookieOptions() {
  return {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
  };
}

async function compareAdd(req, res) {
  const slug = String(req.query.slug || '').trim().toLowerCase();
  const referer = req.get('Referer') || '/ecoles';
  if (!isPortalSlug(slug)) return res.redirect(referer);
  const school = await findPublishedSchool(slug);
  if (!school) return res.redirect(referer);
  const next = compareSlugsParam(addCompareSlug(req.cookies?.[COMPARE_COOKIE], slug));
  res.cookie(COMPARE_COOKIE, next, compareCookieOptions());
  return res.redirect(referer);
}

async function compareRemove(req, res) {
  const slug = String(req.query.slug || '').trim().toLowerCase();
  const referer = req.get('Referer') || '/ecoles/comparer';
  const next = compareSlugsParam(removeCompareSlug(req.cookies?.[COMPARE_COOKIE], slug));
  if (next) {
    res.cookie(COMPARE_COOKIE, next, compareCookieOptions());
  } else {
    res.clearCookie(COMPARE_COOKIE);
  }
  const slugs = parseCompareSlugs(next);
  if (slugs.length >= 2) {
    return res.redirect(`/ecoles/comparer?slugs=${next}`);
  }
  return res.redirect(referer);
}

async function compareClear(_req, res) {
  res.clearCookie(COMPARE_COOKIE);
  return res.redirect('/ecoles');
}

async function marketplaceCompare(req, res, next) {
  try {
    const fromQuery = parseCompareSlugs(req.query.slugs);
    const fromCookie = compareSlugsFromCookie(req.cookies);
    const slugs = fromQuery.length ? fromQuery : fromCookie;
    if (fromQuery.length) {
      res.cookie(COMPARE_COOKIE, compareSlugsParam(fromQuery), compareCookieOptions());
    }
    const rows = await findPublishedSchoolsBySlugs(slugs);
    const schools = rows.map((row) => publicSchoolView(row, { includeBase64: false }));
    const seo = seoForMarketplace({
      heading: 'Comparer des écoles',
      lead: 'Comparez jusqu’à 3 établissements publiés sur EduConnect.',
      canonicalPath: '/ecoles/comparer',
    });
    return res.render('portal/compare', {
      user: null,
      title: seo.title,
      heading: 'Comparer des écoles',
      lead: seo.lead,
      metaDescription: 'Comparez nom, palier, commune, cycle et type de 2 à 3 écoles publiées sur EduConnect.',
      canonicalUrl: `${SITE_ORIGIN}/ecoles/comparer`,
      robots: PUBLIC_ROBOTS,
      portalCss: true,
      ...portalPwaLocals(),
      schools,
      compareSlugs: slugs,
      compareMax: COMPARE_MAX,
      compareError: slugs.length < 2 ? 'Sélectionnez au moins 2 écoles depuis l’annuaire.' : null,
    });
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
    return renderMarketplaceListing(
      req,
      res,
      {},
      {
        verifiedOnly: true,
        verifiedLanding: true,
        heading: 'Établissements vérifiés EduConnect',
        lead: 'Écoles, collèges et lycées Premium et VIP avec badge « Vérifié EduConnect ». Aucune note nominative en public.',
        canonicalPath: '/ecoles/verifies',
      },
    );
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

async function marketplaceMap(req, res, next) {
  try {
    const rows = await listPublishedSchoolsForMap();
    const markers = rows
      .map((row) => publicSchoolMapMarker(row))
      .filter(Boolean);
    const seo = seoForMarketplace({
      heading: 'Carte des écoles',
      lead: 'Écoles, collèges et lycées publiés sur EduConnect — localisation approximative si GPS non renseigné.',
      canonicalPath: '/ecoles/carte',
    });
    return res.render('portal/map', {
      user: null,
      title: seo.title,
      heading: seo.heading,
      lead: seo.lead,
      metaDescription: seo.metaDescription,
      canonicalUrl: seo.canonicalUrl,
      ogTitle: seo.ogTitle,
      ogDescription: seo.ogDescription,
      ogImage: seo.ogImage,
      robots: PUBLIC_ROBOTS,
      portalCss: true,
      ...portalPwaLocals(),
      markers,
      markerCount: markers.length,
      mapCenter: { lat: 5.3364, lng: -4.0267, zoom: 11 },
      markersJson: safeJson(markers),
    });
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
      ...portalPwaLocals(),
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
    'Allow: /ecoles/carte',
    'Allow: /ecoles/comparer',
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
  submitReview,
  compareAdd,
  compareRemove,
  compareClear,
  marketplaceCompare,
  marketplace,
  marketplaceMap,
  verifiedMarketplace,
  marketplaceSeoLanding,
  organizationPage,
  sitemap,
  robots,
  publicAlias,
  requireCsrf,
};
