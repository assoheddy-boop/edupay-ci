const { normalizeTerm } = require('../services/academicTerms');

const FRENCH_MONTHS = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre',
];

function slugify(value, maxLen = 48) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen) || 'document';
}

function trimestreSlug(period) {
  const term = normalizeTerm(period);
  if (term === 'T1' || term === 'T2' || term === 'T3') return term.toLowerCase();
  if (term === 'ANNUELLE') return 'annuelle';
  return slugify(period);
}

function frenchMonthSlug(month, year) {
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (!m || m < 1 || m > 12 || !y) return slugify(`${month}-${year}`);
  return `${FRENCH_MONTHS[m - 1]}-${y}`;
}

function personNameSlug(lastName, firstName) {
  const parts = [lastName, firstName]
    .filter(Boolean)
    .map((part) => slugify(part, 32));
  return parts.join('-') || 'inconnu';
}

function bulletinPdfFilename({ student, period }) {
  const term = trimestreSlug(period);
  const name = personNameSlug(student?.lastName, student?.firstName);
  return `bulletin-${term}-${name}.pdf`;
}

function payslipPdfFilename({ employee, profile, teacher, month, year }) {
  const lastName = employee?.lastName || profile?.lastName || teacher?.user?.lastName;
  const firstName = employee?.firstName || profile?.firstName || teacher?.user?.firstName;
  const name = personNameSlug(lastName, firstName);
  const period = frenchMonthSlug(month, year);
  return `paie-${name}-${period}.pdf`;
}

function asciiFallbackFilename(filename) {
  return String(filename || 'document.pdf')
    .replace(/["\r\n]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '_');
}

function encodeRFC5987(value) {
  return encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildContentDisposition(filename) {
  const safe = String(filename || 'document.pdf').replace(/["\r\n]/g, '');
  const ascii = asciiFallbackFilename(safe);
  if (ascii === safe) {
    return `attachment; filename="${ascii}"`;
  }
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRFC5987(safe)}`;
}

module.exports = {
  FRENCH_MONTHS,
  slugify,
  trimestreSlug,
  frenchMonthSlug,
  personNameSlug,
  bulletinPdfFilename,
  payslipPdfFilename,
  buildContentDisposition,
};
