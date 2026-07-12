const prisma = require('../config/database');
const { MODULES, MODULE_KEYS } = require('../config/modules');
const { getModuleMap, setModule, initSchoolModules } = require('../utils/modules');
const { hashPassword } = require('../utils/password');
const { logAudit } = require('../utils/audit');

async function dashboard(req, res) {
  const [schools, organizations, users] = await Promise.all([
    prisma.school.findMany({
      include: {
        admin: true,
        organization: true,
        _count: { select: { classes: true, modules: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.organization.findMany({
      include: { _count: { select: { schools: true, admins: true } } },
    }),
    prisma.user.count(),
  ]);

  res.render('admin/dashboard', {
    user: req.user,
    schools,
    organizations,
    stats: { schools: schools.length, organizations: organizations.length, users },
    MODULES,
  });
}

async function schoolModules(req, res) {
  const { id } = req.params;
  const school = await prisma.school.findUnique({
    where: { id },
    include: { admin: true, organization: true },
  });
  if (!school) return res.redirect('/admin/dashboard');

  const modules = await getModuleMap(id);
  res.render('admin/school-modules', {
    user: req.user,
    school,
    modules,
    MODULE_KEYS,
    success: req.query.success || null,
  });
}

async function updateSchoolModules(req, res) {
  const { id } = req.params;
  for (const key of MODULE_KEYS) {
    const enabled = req.body[`mod_${key}`] === 'on';
    const locked = req.body[`lock_${key}`] === 'on';
    await setModule(id, key, { enabled, locked });
  }
  res.redirect(`/admin/schools/${id}/modules?success=1`);
}

async function organizations(req, res) {
  const organizations = await prisma.organization.findMany({
    include: {
      schools: true,
      admins: { include: { user: true } },
    },
  });
  res.render('admin/organizations', {
    user: req.user,
    organizations,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function createOrganization(req, res) {
  const { name, slug } = req.body;
  try {
    await prisma.organization.create({
      data: { name, slug: slug || name.toLowerCase().replace(/\s+/g, '-') },
    });
    res.redirect('/admin/organizations?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/organizations?error=1');
  }
}

async function createOrgAdmin(req, res) {
  const { organizationId, email, firstName, lastName, phone, password } = req.body;
  try {
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) return res.redirect('/admin/organizations?error=org');

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.redirect('/admin/organizations?error=email');

    const hashed = await hashPassword(password || 'demo1234');
    await prisma.user.create({
      data: {
        email,
        password: hashed,
        firstName,
        lastName,
        phone,
        role: 'ORGANIZATION_ADMIN',
        organizationAdmin: { create: { organizationId } },
      },
    });

    await logAudit({
      action: 'org_admin_create',
      entity: 'OrganizationAdmin',
      user: req.user,
      ip: req.ip,
      details: { organizationId, email },
    });

    res.redirect('/admin/organizations?success=admin');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/organizations?error=admin');
  }
}

async function assignSchoolToOrg(req, res) {
  const { schoolId, organizationId, campusLabel } = req.body;
  await prisma.school.update({
    where: { id: schoolId },
    data: {
      organizationId: organizationId || null,
      campusLabel: campusLabel || null,
    },
  });
  if (organizationId) {
    await initSchoolModules(schoolId);
    await setModule(schoolId, 'multi_campus', { enabled: true });
  }
  res.redirect('/admin/organizations?success=assigned');
}

module.exports = {
  dashboard,
  schoolModules,
  updateSchoolModules,
  organizations,
  createOrganization,
  createOrgAdmin,
  assignSchoolToOrg,
};
