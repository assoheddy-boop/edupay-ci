const crypto = require('crypto');

/**
 * Première vague d'établissements EPV.
 * Les champs null (adresse, Wave, OM, téléphone, nom du directeur)
 * seront complétés dès que l'école les transmet.
 */
const EPV_SCHOOLS = [
  {
    name: 'EPV Fatoumaba',
    slug: 'epv-fatoumaba',
    city: 'Abidjan',
    campusLabel: null,
    address: null,
    waveNumber: null,
    omNumber: null,
    admin: {
      email: 'epv.fatoumaba@educonnect.ci',
      firstName: 'Direction',
      lastName: 'Fatoumaba',
      phone: null,
    },
  },
  {
    name: 'EPV Graine de la Réussite',
    slug: 'epv-graine-de-la-reussite',
    city: 'Abidjan',
    campusLabel: null,
    address: null,
    waveNumber: null,
    omNumber: null,
    admin: {
      email: 'epv.graine@educonnect.ci',
      firstName: 'Direction',
      lastName: 'Graine de la Réussite',
      phone: null,
    },
  },
  {
    name: "EPV L'Effort",
    slug: 'epv-l-effort',
    city: 'Abidjan',
    campusLabel: null,
    address: null,
    waveNumber: null,
    omNumber: null,
    admin: {
      email: 'epv.effort@educonnect.ci',
      firstName: 'Direction',
      lastName: "L'Effort",
      phone: null,
    },
  },
  {
    name: 'EPV ECEME',
    slug: 'epv-eceme',
    city: 'Bingerville',
    campusLabel: 'Bingerville',
    address: 'Bingerville',
    waveNumber: null,
    omNumber: null,
    admin: {
      email: 'epv.eceme@educonnect.ci',
      firstName: 'Direction',
      lastName: 'ECEME',
      phone: null,
    },
  },
  {
    name: 'EPV La Bonne Main de Dieu',
    slug: 'epv-la-bonne-main-de-dieu',
    city: 'Abidjan',
    campusLabel: 'Yopougon Académie',
    address: 'Fin goudron, Portail Laurier 14, Yopougon',
    logoFile: 'public/img/schools/epv-la-bonne-main-de-dieu.png',
    waveNumber: null,
    omNumber: null,
    admin: {
      email: 'epv.bonne-main@educonnect.ci',
      firstName: 'Direction',
      lastName: 'La Bonne Main de Dieu',
      phone: '07 87 78 11 12 / 01 43 57 44 98',
    },
  },
  {
    name: 'EPV Datro Zahui',
    slug: 'epv-datro-zahui',
    city: 'Abidjan',
    campusLabel: null,
    address: null,
    waveNumber: null,
    omNumber: null,
    admin: {
      email: 'epv.datro-zahui@educonnect.ci',
      firstName: 'Direction',
      lastName: 'Datro Zahui',
      phone: null,
    },
  },
];

function generateTempPassword(slug) {
  const shared = process.env.ONBOARD_TEMP_PASSWORD;
  if (shared) return shared;
  const token = crypto.randomBytes(4).toString('hex');
  const parts = String(slug || 'epv').split('-');
  if (parts[0] === 'epv') {
    const prefix = parts[1] || 'ecole';
    return `Epv-${prefix}-${token}!`;
  }
  const label = (parts[0] || 'ecole').charAt(0).toUpperCase() + (parts[0] || 'ecole').slice(1);
  return `${label}-${token}!`;
}

function pickSchoolFields(def, existing = {}) {
  return {
    name: def.name,
    city: def.city || existing.city || 'Abidjan',
    campusLabel: def.campusLabel ?? existing.campusLabel ?? null,
    address: def.address ?? existing.address ?? null,
    waveNumber: def.waveNumber ?? existing.waveNumber ?? null,
    omNumber: def.omNumber ?? existing.omNumber ?? null,
    currentSchoolYear: def.currentSchoolYear || existing.currentSchoolYear || '2026-2027',
    educationCycle: def.educationCycle || existing.educationCycle || 'COLLEGE',
  };
}

function validateEpvCatalog(schools = EPV_SCHOOLS) {
  const errors = [];
  const slugs = new Set();
  const emails = new Set();

  if (!schools.length) errors.push('catalogue vide');

  schools.forEach((school, index) => {
    const label = school.name || `#${index + 1}`;
    if (!school.name) errors.push(`école ${label}: nom manquant`);
    if (!school.slug) errors.push(`école ${label}: slug manquant`);
    if (!school.admin?.email) errors.push(`école ${label}: email direction manquant`);
    if (school.slug && slugs.has(school.slug)) errors.push(`slug en double: ${school.slug}`);
    if (school.admin?.email && emails.has(school.admin.email)) {
      errors.push(`email en double: ${school.admin.email}`);
    }
    if (school.slug) slugs.add(school.slug);
    if (school.admin?.email) emails.add(school.admin.email);
  });

  return { ok: errors.length === 0, errors, count: schools.length };
}

module.exports = {
  EPV_SCHOOLS,
  validateEpvCatalog,
  generateTempPassword,
  pickSchoolFields,
};
