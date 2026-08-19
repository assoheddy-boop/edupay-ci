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

function publishedWhere() {
  return {
    publicPortalEnabled: true,
    slug: { not: null },
  };
}

async function findPublishedSchool(slug) {
  if (!isPortalSlug(slug)) return null;
  try {
    const school = await prisma.school.findFirst({
      where: {
        ...publishedWhere(),
        slug: String(slug).toLowerCase().trim(),
      },
      select: {
        ...PUBLIC_SCHOOL_SELECT,
        _count: { select: { classes: true } },
        admin: { select: { email: true } },
      },
    });
    return school || null;
  } catch {
    return null;
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
    const fa = a.publicFeatured ? 1 : 0;
    const fb = b.publicFeatured ? 1 : 0;
    if (fb !== fa) return fb - fa;
    const city = String(a.city || '').localeCompare(String(b.city || ''), 'fr');
    if (city) return city;
    return String(a.name || '').localeCompare(String(b.name || ''), 'fr');
  });
}

async function listPublishedSchools({ ville, cycle, type } = {}) {
  const where = { ...publishedWhere() };
  const city = String(ville || '').trim();
  if (city) {
    where.city = { contains: city, mode: 'insensitive' };
  }
  if (cycle) {
    const parsed = parseEducationCycle(cycle);
    if (EDUCATION_CYCLE[String(cycle).toUpperCase()]) {
      where.educationCycle = parsed;
    }
  }
  const publicType = parsePublicType(type);
  if (publicType) {
    where.publicType = publicType;
  }
  const select = { ...PUBLIC_SCHOOL_SELECT, logoBase64: false };
  try {
    let rows;
    try {
      rows = await prisma.school.findMany({
        where,
        select,
        orderBy: [{ publicFeatured: 'desc' }, { city: 'asc' }, { name: 'asc' }],
        take: 200,
      });
    } catch {
      rows = await prisma.school.findMany({
        where,
        select,
        orderBy: [{ city: 'asc' }, { name: 'asc' }],
        take: 200,
      });
    }
    return sortFeaturedFirst(rows);
  } catch {
    return [];
  }
}

async function listPublishedSlugs() {
  try {
    const rows = await prisma.school.findMany({
      where: publishedWhere(),
      select: { slug: true, updatedAt: true },
      orderBy: { slug: 'asc' },
      take: 500,
    });
    return rows.filter((row) => isPortalSlug(row.slug));
  } catch {
    return [];
  }
}

function sitemapXml(entries) {
  const urls = entries
    .map((entry) => {
      const loc = `${SITE_ORIGIN}${entry.path}`;
      const lastmod = entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : '';
      const changefreq = entry.changefreq ? `\n    <changefreq>${entry.changefreq}</changefreq>` : '';
      const priority = entry.priority != null ? `\n    <priority>${entry.priority}</priority>` : '';
      return `  <url>\n    <loc>${loc}</loc>${lastmod}${changefreq}${priority}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

async function buildSitemapXml() {
  const today = new Date().toISOString().slice(0, 10);
  const staticEntries = [
    { path: '/', changefreq: 'weekly', priority: '1.0', lastmod: today },
    { path: '/ecoles', changefreq: 'daily', priority: '0.8', lastmod: today },
    { path: '/devis', changefreq: 'monthly', priority: '0.7', lastmod: today },
    { path: '/guides', changefreq: 'monthly', priority: '0.6', lastmod: today },
  ];
  const schools = await listPublishedSlugs();
  const schoolEntries = schools.map((row) => ({
    path: portalPath(row.slug),
    changefreq: 'weekly',
    priority: '0.7',
    lastmod: row.updatedAt ? new Date(row.updatedAt).toISOString().slice(0, 10) : today,
  }));
  return sitemapXml([...staticEntries, ...schoolEntries]);
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
    if (IGEST_SCHOOL.publicFeatured != null) data.publicFeatured = IGEST_SCHOOL.publicFeatured;
    if (IGEST_SCHOOL.address) data.address = IGEST_SCHOOL.address;
    if (IGEST_SCHOOL.campusLabel) data.campusLabel = IGEST_SCHOOL.campusLabel;
    const result = await prisma.school.updateMany({
      where: { slug },
      data,
    });
    return { ok: true, count: result.count, slug };
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
 * Préfère `publicFeatured` ; sinon IGEST puis d’autres portails publiés.
 * Champs publics uniquement (pas d’élèves, notes ni finances).
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

    const published = await prisma.school.findMany({
      where: publishedWhere(),
      select: FEATURED_SELECT,
      orderBy: [{ name: 'asc' }],
      take: 50,
    });

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
  enableIgestPublicPortal,
};
