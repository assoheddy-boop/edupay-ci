const prisma = require('../config/database');

function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'ecole';
}

async function generateUniqueSchoolSlug(name) {
  const base = slugify(name);
  let slug = base;
  let n = 1;
  while (await prisma.school.findUnique({ where: { slug } })) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

async function findSchoolByCode(code) {
  if (!code) return null;
  const trimmed = code.trim();
  return prisma.school.findFirst({
    where: {
      OR: [{ slug: trimmed.toLowerCase() }, { id: trimmed }],
    },
  });
}

module.exports = { slugify, generateUniqueSchoolSlug, findSchoolByCode };
