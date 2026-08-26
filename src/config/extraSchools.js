const { IGEST_SCHOOL } = require('./igestSchool');
const { CABEL_SCHOOL } = require('./cabelSchool');

/**
 * Établissements partenaires hors vague EPV.
 * Ne pas fusionner dans EPV_SCHOOLS (les tests EPV exigent exactement 6 écoles).
 */
const EXTRA_SCHOOLS = [IGEST_SCHOOL, CABEL_SCHOOL];

function findExtraSchool(slug) {
  return EXTRA_SCHOOLS.find((school) => school.slug && school.slug === slug) || null;
}

module.exports = {
  EXTRA_SCHOOLS,
  findExtraSchool,
};
