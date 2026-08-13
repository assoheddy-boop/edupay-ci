const fs = require('fs');
const path = require('path');
const prisma = require('../config/database');
const { hashPassword } = require('./password');
const { initSchoolModules, initFinanceDefaults } = require('./modules');
const { ensureSubscriptionPlans, findPlanBySlug, assignPlanToSchool } = require('./plans');
const { generateTempPassword, pickSchoolFields } = require('../config/epvSchools');
const { saveSchoolLogo } = require('./schoolLogo');

function applyCatalogLogo(schoolId, logoFile) {
  if (!logoFile) return null;
  const abs = path.isAbsolute(logoFile) ? logoFile : path.join(__dirname, '../..', logoFile);
  if (!fs.existsSync(abs)) return null;
  const buffer = fs.readFileSync(abs);
  return saveSchoolLogo(schoolId, {
    buffer,
    originalname: path.basename(abs),
    mimetype: 'image/png',
  });
}

async function attachLogoAndPhone(school, def) {
  const data = {};
  const logo = applyCatalogLogo(school.id, def.logoFile);
  if (logo) {
    data.logoUrl = logo.logoUrl;
    data.logoBase64 = logo.logoBase64;
  }

  if (Object.keys(data).length) {
    await prisma.school.update({ where: { id: school.id }, data });
  }

  if (def.admin?.phone && school.adminId) {
    await prisma.user.update({
      where: { id: school.adminId },
      data: { phone: def.admin.phone },
    });
  } else if (def.admin?.phone && school.admin?.id) {
    await prisma.user.update({
      where: { id: school.admin.id },
      data: { phone: def.admin.phone },
    });
  }

  return logo;
}

async function ensurePlan(planSlug = 'premium') {
  await ensureSubscriptionPlans();
  return findPlanBySlug(planSlug);
}

async function provisionSchoolServices(schoolId, plan) {
  await initSchoolModules(schoolId);
  await initFinanceDefaults(schoolId);
  if (plan) await assignPlanToSchool(schoolId, plan.id);
}

async function onboardSchool(def, { plan, password } = {}) {
  const existing = await prisma.school.findUnique({
    where: { slug: def.slug },
    include: { admin: true },
  });

  if (existing) {
    const data = pickSchoolFields(def, existing);
    const school = await prisma.school.update({
      where: { id: existing.id },
      data,
      include: { admin: true },
    });
    await provisionSchoolServices(school.id, plan);
    await attachLogoAndPhone(school, def);
    return {
      status: 'updated',
      name: school.name,
      slug: school.slug,
      city: school.city,
      address: school.address,
      email: school.admin?.email || def.admin.email,
      password: null,
    };
  }

  const emailOwner = await prisma.user.findUnique({
    where: { email: def.admin.email },
    include: { school: true },
  });

  if (emailOwner?.school) {
    return {
      status: 'skipped',
      name: emailOwner.school.name,
      slug: emailOwner.school.slug,
      city: emailOwner.school.city,
      email: emailOwner.email,
      password: null,
      reason: 'email déjà lié à une école',
    };
  }

  const tempPassword = password || generateTempPassword(def.slug);
  const hashed = await hashPassword(tempPassword);
  const schoolFields = pickSchoolFields(def);

  const user = emailOwner
    ? await prisma.user.update({
      where: { id: emailOwner.id },
      data: {
        role: 'SCHOOL_ADMIN',
        firstName: def.admin.firstName,
        lastName: def.admin.lastName,
        phone: def.admin.phone || emailOwner.phone,
        school: {
          create: {
            ...schoolFields,
            slug: def.slug,
            subscription: plan?.slug || 'premium',
            planId: plan?.id || null,
          },
        },
      },
      include: { school: true },
    })
    : await prisma.user.create({
      data: {
        email: def.admin.email,
        password: hashed,
        firstName: def.admin.firstName,
        lastName: def.admin.lastName,
        phone: def.admin.phone || null,
        role: 'SCHOOL_ADMIN',
        school: {
          create: {
            ...schoolFields,
            slug: def.slug,
            subscription: plan?.slug || 'premium',
            planId: plan?.id || null,
          },
        },
      },
      include: { school: true },
    });

  await provisionSchoolServices(user.school.id, plan);
  await attachLogoAndPhone(user.school, def);

  return {
    status: 'created',
    name: user.school.name,
    slug: user.school.slug,
    city: user.school.city,
    address: user.school.address,
    email: user.email,
    password: emailOwner ? null : tempPassword,
  };
}

async function onboardSchools(schools, { planSlug = 'premium' } = {}) {
  const plan = await ensurePlan(planSlug);
  const results = [];
  for (const def of schools) {
    results.push(await onboardSchool(def, { plan }));
  }
  return results;
}

module.exports = {
  onboardSchool,
  onboardSchools,
};
