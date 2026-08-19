const prisma = require('../config/database');
const { logAudit } = require('../utils/audit');
const { getModuleMap, isEnabled } = require('../utils/modules');
const { MARKETPLACE_MODULE } = require('../utils/marketplaceAddon');
const {
  parsePortalPostInput,
  publicPostView,
  PORTAL_POST_KIND_OPTIONS,
  portalPath,
} = require('../utils/publicPortal');

async function page(req, res) {
  const school = req.user.school;
  if (!school) return res.redirect('/auth/login');
  const mods = await getModuleMap(school.id);
  const marketplaceEnabled = isEnabled(mods, MARKETPLACE_MODULE);
  const posts = typeof prisma.portalPost?.findMany === 'function'
    ? await prisma.portalPost.findMany({
      where: { schoolId: school.id },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    }).then((rows) => rows.map(publicPostView))
    : [];
  res.render('school/portail', {
    user: req.user,
    school,
    posts,
    kindOptions: PORTAL_POST_KIND_OPTIONS,
    portalPath: school.slug ? portalPath(school.slug) : null,
    marketplaceEnabled,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function createNews(req, res) {
  const school = req.user.school;
  if (!school) return res.redirect('/auth/login');
  const mods = await getModuleMap(school.id);
  if (!isEnabled(mods, MARKETPLACE_MODULE)) {
    return res.redirect('/school/portail?error=1');
  }
  const parsed = parsePortalPostInput(req.body);
  if (!parsed.ok) {
    return res.redirect(`/school/portail?error=${encodeURIComponent(parsed.errors[0] || 'invalide')}`);
  }
  try {
    await prisma.portalPost.create({
      data: {
        schoolId: school.id,
        title: parsed.title,
        body: parsed.body,
        kind: parsed.kind,
        publishedAt: parsed.publishedAt,
      },
    });
    await logAudit({
      action: 'portal_post_create',
      entity: 'PortalPost',
      user: req.user,
      schoolId: school.id,
      ip: req.ip,
    });
    return res.redirect('/school/portail?success=created');
  } catch (err) {
    console.error(err);
    return res.redirect('/school/portail?error=1');
  }
}

async function deleteNews(req, res) {
  const school = req.user.school;
  if (!school) return res.redirect('/auth/login');
  const mods = await getModuleMap(school.id);
  if (!isEnabled(mods, MARKETPLACE_MODULE)) {
    return res.redirect('/school/portail?error=1');
  }
  const id = String(req.params.id || '').trim();
  if (!id) return res.redirect('/school/portail?error=1');
  try {
    await prisma.portalPost.deleteMany({
      where: { id, schoolId: school.id },
    });
    await logAudit({
      action: 'portal_post_delete',
      entity: 'PortalPost',
      entityId: id,
      user: req.user,
      schoolId: school.id,
      ip: req.ip,
    });
    return res.redirect('/school/portail?success=deleted');
  } catch (err) {
    console.error(err);
    return res.redirect('/school/portail?error=1');
  }
}

module.exports = {
  page,
  createNews,
  deleteNews,
};
