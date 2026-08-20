const prisma = require('../config/database');
const { IGEST_SCHOOL } = require('../config/igestSchool');
const { parseEducationCycle, EDUCATION_CYCLE } = require('../utils/educationCycle');
const {
  PUBLIC_SCHOOL_SELECT,
  isPortalSlug,
  portalPath,
  SITE_ORIGIN,
  parsePublicType,
  publicPostView,
  publicSchoolView,
} = require('../utils/publicPortal');
const {
  MARKETPLACE_MODULE,
  MARKETPLACE_TIER,
  publishedWhere,
  publishedWhereLegacy,
  marketplaceSortRank,
  applyMarketplaceOffer,
  isLiveTier,
} = require('../utils/marketplaceAddon');

function publicSelect(includeTier = true) {
  if (includeTier) return { ...PUBLIC_SCHOOL_SELECT };
  const select = { ...PUBLIC_SCHOOL_SELECT };
  delete select.marketplaceTier;
  return select;
}

async function findPublishedSchool(slug) {
  if (!isPortalSlug(slug)) return null;
  const whereSlug = String(slug).toLowerCase().trim();
  const select = {
    ...publicSelect(true),
    _count: { select: { classes: true } },
    admin: { select: { email: true } },
  };
  try {
    const school = await prisma.school.findFirst({
      where: {
        ...publishedWhere(),
        slug: whereSlug,
      },
      select,
    });
    return school || null;
  } catch {
    try {
      const school = await prisma.school.findFirst({
        where: {
          ...publishedWhereLegacy(),
          slug: whereSlug,
        },
        select: {
          ...publicSelect(false),
          _count: { select: { classes: true } },
          admin: { select: { email: true } },
        },
      });
      return school || null;
    } catch {
      return null;
    }
  }
}

async function listPortalPosts(schoolId) {
  if (!schoolId || typeof prisma.portalPost?.findMany !== 'function') return [];
  try {
    const rows = await prisma.portalPost.findMany({
      where: { schoolId },
      orderBy: { publishedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        title: true,
        body: true,
        publishedAt: true,
        kind: true,
      },
    });
    return rows.map(publicPostView).filter(Boolean);
  } catch {
    return [];
  }
}

function sortFeaturedFirst(rows) {
  return [...(rows || [])].sort((a, b) => {
    const ra = marketplaceSortRank(a);
    const rb = marketplaceSortRank(b);
    if (rb !== ra) return rb - ra;
    const city = String(a.city || '').localeCompare(String(b.city || ''), 'fr');
    if (city) return city;
    return String(a.name || '').localeCompare(String(b.name || ''), 'fr');
  });
}

async function queryPublishedSchools(where, select) {
  try {
    return await prisma.school.findMany({
      where,
      select,
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      take: 200,
    });
  } catch {
    return null;
  }
}

async function listPublishedSchools({ ville, commune, cycle, type, organizationId } = {}) {
  const city = String(ville || '').trim();
  const communeLabel = String(commune || '').trim();
  const extra = {};
  if (communeLabel) {
    extra.OR = [
      { commune: { contains: communeLabel, mode: 'insensitive' } },
      { campusLabel: { contains: communeLabel, mode: 'insensitive' } },
    ];
  } else if (city) {
    extra.OR = [
      { city: { contains: city, mode: 'insensitive' } },
      { campusLabel: { contains: city, mode: 'insensitive' } },
      { address: { contains: city, mode: 'insensitive' } },
    ];
  }
  if (organizationId) {
    extra.organizationId = organizationId;
  }
  if (cycle) {
    const parsed = parseEducationCycle(cycle);
    if (EDUCATION_CYCLE[String(cycle).toUpperCase()]) {
      extra.educationCycle = parsed;
    }
  }
  const publicType = parsePublicType(type);
  if (publicType) {
    extra.publicType = publicType;
  }

  const select = { ...publicSelect(true), logoBase64: false };
  let rows = await queryPublishedSchools(publishedWhere(extra), select);
  if (!rows) {
    const legacySelect = { ...publicSelect(false), logoBase64: false };
    rows = await queryPublishedSchools({ ...publishedWhereLegacy(), ...extra }, legacySelect);
  }
  return sortFeaturedFirst(rows || []);
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sitemapDay(value, fallback = '2026-01-01') {
  try {
    if (value == null || value === '') return fallback;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return fallback;
    return d.toISOString().slice(0, 10);
  } catch {
    return fallback;
  }
}

function isIndexableSchool(row) {
  return isPortalSlug(row?.slug) && isLiveTier(row?.marketplaceTier);
}

/** Same publication rules as /ecoles. No ORDER BY on nullable slug; lastmod is sanitized. */
async function querySitemapSchools(select) {
  try {
    return await prisma.school.findMany({
      where: publishedWhere(),
      select,
      take: 500,
    });
  } catch {
    return null;
  }
}

async function listPublishedSlugs() {
  try {
    let rows = await querySitemapSchools({
      slug: true,
      updatedAt: true,
      marketplaceTier: true,
    });
    if (!rows) {
      rows = await querySitemapSchools({ slug: true, marketplaceTier: true });
    }
    return (rows || []).filter(isIndexableSchool);
  } catch {
    return [];
  }
}

function sitemapXml(entries) {
  const urls = (entries || [])
    .map((entry) => {
      const loc = xmlEscape(`${SITE_ORIGIN}${entry.path}`);
      const lastmod = entry.lastmod ? `\n    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>` : '';
      const changefreq = entry.changefreq ? `\n    <changefreq>${xmlEscape(entry.changefreq)}</changefreq>` : '';
      const priority = entry.priority != null ? `\n    <priority>${xmlEscape(entry.priority)}</priority>` : '';
      return `  <url>\n    <loc>${loc}</loc>${lastmod}${changefreq}${priority}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function staticSitemapEntries(today) {
  const { listSeoLandingPaths } = require('../config/marketplaceSeoRoutes');
  return [
    { path: '/', changefreq: 'weekly', priority: '1.0', lastmod: today },
    { path: '/ecoles', changefreq: 'daily', priority: '0.8', lastmod: today },
    { path: '/ecoles/verifies', changefreq: 'weekly', priority: '0.75', lastmod: today },
    ...listSeoLandingPaths().map((path) => ({
      path,
      changefreq: 'weekly',
      priority: '0.72',
      lastmod: today,
    })),
    { path: '/devis', changefreq: 'monthly', priority: '0.7', lastmod: today },
    { path: '/guides', changefreq: 'monthly', priority: '0.6', lastmod: today },
    { path: '/mentions-legales', changefreq: 'yearly', priority: '0.3', lastmod: today },
    { path: '/confidentialite', changefreq: 'yearly', priority: '0.3', lastmod: today },
    { path: '/cgu', changefreq: 'yearly', priority: '0.3', lastmod: today },
    { path: '/cookies', changefreq: 'yearly', priority: '0.2', lastmod: today },
  ];
}

function fallbackSitemapXml() {
  return sitemapXml(staticSitemapEntries(sitemapDay(new Date())));
}

async function buildSitemapXml() {
  const today = sitemapDay(new Date());
  const staticEntries = staticSitemapEntries(today);
  try {
    const schools = await listPublishedSlugs();
    const schoolEntries = schools.map((row) => ({
      path: portalPath(row.slug),
      changefreq: 'weekly',
      priority: '0.7',
      lastmod: sitemapDay(row.updatedAt, today),
    }));
    return sitemapXml([...staticEntries, ...schoolEntries]);
  } catch (err) {
    console.error('[sitemap]', err?.message || err);
    return sitemapXml(staticEntries);
  }
}

async function enableEpvMarketplaceDemos() {
  const { EPV_SCHOOLS, pickSchoolFields } = require('../config/epvSchools');
  const { applyCatalogLogo } = require('../utils/onboardSchools');
  const results = [];
  for (const def of EPV_SCHOOLS) {
    if (!def.slug) continue;
    const school = await prisma.school.findFirst({ where: { slug: def.slug }, select: { id: true } });
    if (!school?.id) {
      results.push({ slug: def.slug, ok: false, reason: 'school_not_found' });
      continue;
    }
    const data = pickSchoolFields(def);
    try {
      await prisma.school.update({ where: { id: school.id }, data });
    } catch (err) {
      const fallback = { ...data };
      delete fallback.marketplaceStartedAt;
      delete fallback.marketplaceExpiresAt;
      await prisma.school.update({ where: { id: school.id }, data: fallback });
    }
    await applyCatalogLogo(school.id, def.logoFile);
    await applyMarketplaceOffer(school.id, {
      tier: data.marketplaceTier || MARKETPLACE_TIER.PREMIUM,
      publish: true,
      enableModule: true,
    });
    results.push({ slug: def.slug, ok: true, tier: data.marketplaceTier || MARKETPLACE_TIER.PREMIUM });
  }
  return { ok: true, results };
}

async function enableMarketplaceDemos() {
  const igest = await enableIgestPublicPortal();
  const epv = await enableEpvMarketplaceDemos();
  return { igest, epv };
}

async function findPublishedOrganization(slug) {
  const key = String(slug || '').trim().toLowerCase();
  if (!key) return null;
  try {
    const org = await prisma.organization.findFirst({
      where: { slug: key, publicPortalEnabled: true },
    });
    if (!org) return null;
    const schools = await listPublishedSchools({ organizationId: org.id });
    if (!schools.length) return null;
    return { organization: org, schools };
  } catch {
    return null;
  }
}

async function enableIgestPublicPortal() {
  const slug = IGEST_SCHOOL.slug;
  if (!slug) return { ok: false, reason: 'no_slug' };
  try {
    const data = { publicPortalEnabled: true };
    if (IGEST_SCHOOL.publicPhone) data.publicPhone = IGEST_SCHOOL.publicPhone;
    if (IGEST_SCHOOL.publicDescription) data.publicDescription = IGEST_SCHOOL.publicDescription;
    if (IGEST_SCHOOL.publicLife) data.publicLife = IGEST_SCHOOL.publicLife;
    if (IGEST_SCHOOL.lat != null) data.lat = IGEST_SCHOOL.lat;
    if (IGEST_SCHOOL.lng != null) data.lng = IGEST_SCHOOL.lng;
    if (IGEST_SCHOOL.publicType) data.publicType = IGEST_SCHOOL.publicType;
    if (IGEST_SCHOOL.address) data.address = IGEST_SCHOOL.address;
    if (IGEST_SCHOOL.campusLabel) data.campusLabel = IGEST_SCHOOL.campusLabel;
    data.marketplaceTier = IGEST_SCHOOL.marketplaceTier || MARKETPLACE_TIER.VIP;
    data.publicFeatured = true;
    let result;
    try {
      result = await prisma.school.updateMany({
        where: { slug },
        data,
      });
    } catch {
      delete data.marketplaceTier;
      result = await prisma.school.updateMany({
        where: { slug },
        data,
      });
    }
    const school = await prisma.school.findFirst({
      where: { slug },
      select: { id: true },
    });
    if (school?.id) {
      await applyMarketplaceOffer(school.id, {
        tier: IGEST_SCHOOL.marketplaceTier || MARKETPLACE_TIER.VIP,
        publish: true,
        enableModule: true,
      });
    }
    return { ok: true, count: result.count, slug, module: MARKETPLACE_MODULE };
  } catch (err) {
    return { ok: false, reason: err?.message || 'update_failed' };
  }
}

const FEATURED_SELECT = { ...PUBLIC_SCHOOL_SELECT, logoBase64: false };

function toPublicCards(rows) {
  return rows.map((row) => publicSchoolView(row, { includeBase64: false })).filter(Boolean);
}

/**
 * 2–3 écoles pour la vitrine accueil.
 * VIP, puis PREMIUM / featured, puis IGEST. Champs publics uniquement.
 */
async function listFeaturedSchools(limit = 3) {
  const take = Math.max(1, Math.min(Number(limit) || 3, 6));
  try {
    let preferred = [];
    try {
      preferred = await prisma.school.findMany({
        where: { ...publishedWhere(), publicFeatured: true },
        select: FEATURED_SELECT,
        orderBy: [{ name: 'asc' }],
        take,
      });
    } catch {
      preferred = [];
    }

    if (preferred.length >= take) {
      return toPublicCards(sortFeaturedFirst(preferred).slice(0, take));
    }

    let published = [];
    try {
      published = await prisma.school.findMany({
        where: publishedWhere(),
        select: FEATURED_SELECT,
        orderBy: [{ name: 'asc' }],
        take: 50,
      });
    } catch {
      published = await prisma.school.findMany({
        where: publishedWhereLegacy(),
        select: FEATURED_SELECT,
        orderBy: [{ name: 'asc' }],
        take: 50,
      });
    }

    const byId = new Map();
    const push = (row) => {
      if (!row || !row.slug || byId.has(row.id)) return;
      byId.set(row.id, row);
    };
    preferred.forEach(push);
    const igest = published.find((row) => row.slug === IGEST_SCHOOL.slug);
    if (igest) push(igest);
    sortFeaturedFirst(published).forEach(push);

    return toPublicCards([...byId.values()].slice(0, take));
  } catch {
    return [];
  }
}

module.exports = {
  publishedWhere,
  findPublishedSchool,
  listPublishedSchools,
  listPublishedSlugs,
  listFeaturedSchools,
  listPortalPosts,
  sortFeaturedFirst,
  buildSitemapXml,
  fallbackSitemapXml,
  enableIgestPublicPortal,
  enableEpvMarketplaceDemos,
  enableMarketplaceDemos,
  findPublishedOrganization,
};
