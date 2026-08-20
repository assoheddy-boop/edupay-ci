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

function epvPublicDescription(name) {
  return `${name} — établissement partenaire EduConnect en Côte d'Ivoire. Page publique sans notes ni bulletins en ligne.`;
}

function epvMarketplaceDefaults(def) {
  const name = def.name || 'École';
  return {
    marketplaceTier: def.marketplaceTier || 'PREMIUM',
    publicPortalEnabled: def.publicPortalEnabled ?? true,
    publicFeatured: def.publicFeatured ?? true,
    publicType: def.publicType || 'PRIVE',
    publicDescription: def.publicDescription || epvPublicDescription(name),
    publicPhone: def.publicPhone ?? def.admin?.phone ?? null,
    publicLife: def.publicLife || 'Cantine, activités et vie scolaire : renseignements au secrétariat. Aucune liste d’élèves n’est publiée.',
    address: def.address ?? def.campusLabel ?? def.city ?? 'Abidjan',
  };
}

function pickSchoolFields(def, existing = {}) {
  const marketplace = epvMarketplaceDefaults(def);
  return {
    name: def.name,
    city: def.city || existing.city || 'Abidjan',
    campusLabel: def.campusLabel ?? existing.campusLabel ?? null,
    address: def.address ?? existing.address ?? def.campusLabel ?? def.city ?? 'Abidjan',
    commune: def.commune ?? existing.commune ?? def.campusLabel ?? null,
    waveNumber: def.waveNumber ?? existing.waveNumber ?? null,
    omNumber: def.omNumber ?? existing.omNumber ?? null,
    currentSchoolYear: def.currentSchoolYear || existing.currentSchoolYear || '2026-2027',
    educationCycle: def.educationCycle || existing.educationCycle || 'COLLEGE',
    publicPortalEnabled: marketplace.publicPortalEnabled,
    publicDescription: marketplace.publicDescription,
    publicPhone: marketplace.publicPhone,
    publicLife: marketplace.publicLife,
    publicBanner: def.publicBanner ?? existing.publicBanner ?? null,
    publicType: marketplace.publicType,
    publicFeatured: marketplace.publicFeatured,
    marketplaceTier: marketplace.marketplaceTier,
    lat: def.lat ?? existing.lat ?? null,
    lng: def.lng ?? existing.lng ?? null,
    officialName: def.officialName ?? existing.officialName ?? null,
    menetCode: def.menetCode ?? existing.menetCode ?? null,
    menetAgrement: def.menetAgrement ?? existing.menetAgrement ?? null,
    nccNumber: def.nccNumber ?? existing.nccNumber ?? null,
    postalAddress: def.postalAddress ?? existing.postalAddress ?? null,
    publicPhones: def.publicPhones ?? existing.publicPhones ?? def.publicPhone ?? existing.publicPhone ?? null,
    educationLevels: def.educationLevels ?? existing.educationLevels ?? null,
    dren: def.dren ?? existing.dren ?? null,
    directorName: def.directorName
      ?? existing.directorName
      ?? (def.admin ? `${def.admin.firstName || ''} ${def.admin.lastName || ''}`.trim() || null : null),
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

/** Vitrine multi-campus /e/groupe/epv */
const EPV_ORGANIZATION = {
  slug: 'epv',
  name: 'EPV',
  city: 'Abidjan',
  publicDescription:
    "Réseau d'établissements EPV partenaires EduConnect en Côte d'Ivoire. Pages publiques par campus ; notes et bulletins dans l'espace parent.",
};

module.exports = {
  EPV_SCHOOLS,
  EPV_ORGANIZATION,
  validateEpvCatalog,
  generateTempPassword,
  pickSchoolFields,
  epvMarketplaceDefaults,
  epvPublicDescription,
};
