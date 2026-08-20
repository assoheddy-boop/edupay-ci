const { normalizeTerm } = require('../services/academicTerms');

const TERM_SLUGS = {
  T1: 'Trimestre-1',
  T2: 'Trimestre-2',
  T3: 'Trimestre-3',
  ANNUELLE: 'Annuelle',
};

function stripAccents(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function slugify(value, maxLen = 48) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen) || 'document';
}

function filenameNom(value, maxLen = 32) {
  const cleaned = stripAccents(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen);
  return cleaned || 'INCONNU';
}

function filenamePrenom(value, maxLen = 32) {
  const cleaned = stripAccents(value)
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-')
    .slice(0, maxLen);
  return cleaned || 'Inconnu';
}

function personNameSlug(lastName, firstName) {
  return `${filenameNom(lastName)}-${filenamePrenom(firstName)}`;
}

function trimestreSlug(period) {
  const term = normalizeTerm(period);
  if (TERM_SLUGS[term]) return TERM_SLUGS[term];
  return stripAccents(period)
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9-]/g, '')
    .replace(/^-|-$/g, '') || 'Periode';
}

module.exports = {
  stripAccents,
  slugify,
  filenameNom,
  filenamePrenom,
  personNameSlug,
  trimestreSlug,
};
