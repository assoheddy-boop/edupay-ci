const prisma = require('../config/database');
const { IGEST_SCHOOL } = require('../config/igestSchool');
const { parseEducationCycle, EDUCATION_CYCLE } = require('../utils/educationCycle');
const {
  PUBLIC_SCHOOL_SELECT,
  isPortalSlug,
  portalPath,
  SITE_ORIGIN,
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

async function listPublishedSchools({ ville, cycle } = {}) {
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
  try {
    return await prisma.school.findMany({
      where,
      select: { ...PUBLIC_SCHOOL_SELECT, logoBase64: false },
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      take: 200,
    });
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
    const result = await prisma.school.updateMany({
      where: { slug },
      data,
    });
    return { ok: true, count: result.count, slug };
  } catch (err) {
    return { ok: false, reason: err?.message || 'update_failed' };
  }
}

module.exports = {
  publishedWhere,
  findPublishedSchool,
  listPublishedSchools,
  listPublishedSlugs,
  buildSitemapXml,
  enableIgestPublicPortal,
};
