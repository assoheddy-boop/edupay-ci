/**
 * Landings SEO locales — /ecoles/:slug
 * Pas de contenu élève ; filtres sur l’annuaire marketplace.
 */
const MARKETPLACE_SEO_LANDINGS = [
  {
    slug: 'colleges-abidjan',
    ville: 'Abidjan',
    cycle: 'COLLEGE',
    heading: 'Collèges à Abidjan',
    lead: 'Annuaire des collèges publiés sur EduConnect à Abidjan. Notes et bulletins restent dans l’espace parent.',
  },
  {
    slug: 'lycees-abidjan',
    ville: 'Abidjan',
    cycle: 'LYCEE',
    heading: 'Lycées à Abidjan',
    lead: 'Lycées partenaires EduConnect à Abidjan — page publique sans résultats nominatifs.',
  },
  {
    slug: 'primaires-abidjan',
    ville: 'Abidjan',
    cycle: 'PRIMAIRE',
    heading: 'Écoles primaires à Abidjan',
    lead: 'Primaires référencées sur EduConnect à Abidjan.',
  },
  {
    slug: 'colleges-yopougon',
    ville: 'Abidjan',
    commune: 'Yopougon',
    cycle: 'COLLEGE',
    heading: 'Collèges à Yopougon',
    lead: 'Collèges à Yopougon (Abidjan) publiés sur l’annuaire EduConnect.',
  },
  {
    slug: 'lycees-yopougon',
    ville: 'Abidjan',
    commune: 'Yopougon',
    cycle: 'LYCEE',
    heading: 'Lycées à Yopougon',
    lead: 'Lycées à Yopougon référencés sur EduConnect.',
  },
  {
    slug: 'ecoles-bingerville',
    ville: 'Bingerville',
    heading: 'Écoles à Bingerville',
    lead: 'Établissements scolaires à Bingerville sur EduConnect.',
  },
];

const SEO_LANDING_BY_SLUG = Object.fromEntries(
  MARKETPLACE_SEO_LANDINGS.map((entry) => [entry.slug, entry]),
);

function findSeoLanding(slug) {
  const key = String(slug || '').trim().toLowerCase();
  return SEO_LANDING_BY_SLUG[key] || null;
}

function seoLandingPath(slug) {
  return `/ecoles/${String(slug || '').trim()}`;
}

function listSeoLandingPaths() {
  return MARKETPLACE_SEO_LANDINGS.map((entry) => seoLandingPath(entry.slug));
}

module.exports = {
  MARKETPLACE_SEO_LANDINGS,
  findSeoLanding,
  seoLandingPath,
  listSeoLandingPaths,
};
