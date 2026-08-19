const { parseEducationCycle, CYCLE_LABELS, EDUCATION_CYCLE_OPTIONS } = require('./educationCycle');

const SITE_ORIGIN = (process.env.APP_URL || 'https://educonnect-ci.com').replace(/\/$/, '');
const CONTACT_INBOX = 'contact@educonnect.ci';

const PUBLIC_SCHOOL_SELECT = {
  id: true,
  name: true,
  slug: true,
  city: true,
  address: true,
  campusLabel: true,
  logoUrl: true,
  logoBase64: true,
  educationCycle: true,
  publicPortalEnabled: true,
  publicDescription: true,
  publicPhone: true,
  lat: true,
  lng: true,
};

const RESERVED_SLUGS = new Set([
  'e',
  'ecoles',
  'ecole',
  'schools',
  'auth',
  'school',
  'parent',
  'teacher',
  'admin',
  'group',
  'hr',
  'transfer',
  'class',
  'stats',
  'reinscription',
  'redoublement',
  'timetable',
  'api',
  'metrics',
  'offline',
  'prefs',
  'uploads',
  'js',
  'css',
  'icons',
  'img',
  'fonts',
  'assets',
  'devis',
  'guides',
  'guide',
  'mentions-legales',
  'mentions',
  'legal',
  'confidentialite',
  'privacy',
  'cgu',
  'conditions',
  'cookies',
  'sitemap.xml',
  'robots.txt',
  'manifest.json',
  'favicon.ico',
  'sw.js',
  'service-worker',
  'login',
  'register',
  'logout',
  'health',
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,78}$/;

function isReservedSlug(slug) {
  return RESERVED_SLUGS.has(String(slug || '').toLowerCase());
}

function isPortalSlug(slug) {
  const value = String(slug || '').toLowerCase().trim();
  if (!SLUG_RE.test(value)) return false;
  if (isReservedSlug(value)) return false;
  return true;
}

function portalPath(slug) {
  return `/e/${encodeURIComponent(String(slug || '').toLowerCase())}`;
}

function portalUrl(slug) {
  return `${SITE_ORIGIN}${portalPath(slug)}`;
}

function parseOptionalFloat(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(String(raw).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

function parseLat(raw) {
  const n = parseOptionalFloat(raw);
  if (n == null || n < -90 || n > 90) return null;
  return n;
}

function parseLng(raw) {
  const n = parseOptionalFloat(raw);
  if (n == null || n < -180 || n > 180) return null;
  return n;
}

function parsePublicPortalFields(body = {}) {
  const description = String(body.publicDescription || '').trim().slice(0, 2000);
  const phone = String(body.publicPhone || '').trim().slice(0, 40);
  const enabledRaw = body.publicPortalEnabled;
  const publicPortalEnabled = enabledRaw === 'on' || enabledRaw === 'true' || enabledRaw === '1' || enabledRaw === true;
  return {
    publicPortalEnabled,
    publicDescription: description || null,
    publicPhone: phone || null,
    lat: parseLat(body.lat),
    lng: parseLng(body.lng),
  };
}

function osmEmbedSrc(lat, lng) {
  if (lat == null || lng == null) return null;
  const delta = 0.012;
  const minLng = lng - delta;
  const minLat = lat - delta;
  const maxLng = lng + delta;
  const maxLat = lat + delta;
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`;
}

function osmSearchUrl(address, city) {
  const q = [address, city, 'Côte d\'Ivoire'].filter(Boolean).join(', ');
  if (!q) return null;
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}`;
}

function cycleFilterOptions() {
  return EDUCATION_CYCLE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }));
}

function seoForSchool(school) {
  const cycle = CYCLE_LABELS[parseEducationCycle(school?.educationCycle)] || 'établissement';
  const city = school?.city || 'Côte d\'Ivoire';
  const name = school?.name || 'École';
  const title = `${name} — ${cycle} à ${city}`;
  const fromDesc = String(school?.publicDescription || '').replace(/\s+/g, ' ').trim();
  const description = (fromDesc || `${name}, ${cycle} à ${city}. Page officielle sur EduConnect. Notes et bulletins dans l’espace parent.`)
    .slice(0, 160);
  return {
    title,
    metaDescription: description,
    canonicalUrl: portalUrl(school?.slug),
  };
}

function seoForMarketplace({ ville, cycle } = {}) {
  const cycleLabel = cycle ? CYCLE_LABELS[parseEducationCycle(cycle)] : null;
  const bits = ['Écoles EduConnect', ville, cycleLabel].filter(Boolean);
  const title = bits.join(' — ');
  const description = ville || cycleLabel
    ? `Établissements EduConnect ${cycleLabel ? `(${cycleLabel})` : ''} ${ville ? `à ${ville}` : 'en Côte d’Ivoire'}. Pages publiques, sans notes ni bulletins en ligne.`
        .replace(/\s+/g, ' ')
        .trim()
    : 'Annuaire des écoles EduConnect en Côte d’Ivoire. Chaque établissement publie sa page. Les résultats scolaires restent derrière connexion parent.';
  return {
    title,
    metaDescription: description.slice(0, 160),
    canonicalUrl: `${SITE_ORIGIN}/ecoles`,
  };
}

function sanitizeContact(body = {}) {
  const honeypot = String(body.website || body.company || '').trim();
  const name = String(body.name || '').trim().slice(0, 120);
  const email = String(body.email || '').trim().slice(0, 120);
  const phone = String(body.phone || '').trim().slice(0, 40);
  const message = String(body.message || '').trim().slice(0, 2000);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const errors = [];
  if (honeypot) return { ok: false, spam: true, errors: [] };
  if (!name) errors.push('Indiquez votre nom.');
  if (!emailOk) errors.push('Indiquez un e-mail valide.');
  if (message.length < 10) errors.push('Le message est trop court.');
  return { ok: errors.length === 0, spam: false, errors, name, email, phone, message };
}

function publicSchoolView(school, extras = {}) {
  if (!school) return null;
  const cycle = parseEducationCycle(school.educationCycle);
  return {
    name: school.name,
    slug: school.slug,
    city: school.city,
    address: school.address,
    campusLabel: school.campusLabel,
    logoUrl: school.logoUrl,
    logoBase64: extras.includeBase64 === false ? null : school.logoBase64,
    educationCycle: cycle,
    cycleLabel: CYCLE_LABELS[cycle],
    publicDescription: school.publicDescription,
    publicPhone: school.publicPhone,
    lat: school.lat,
    lng: school.lng,
    classCount: extras.classCount != null ? extras.classCount : null,
    osmEmbedSrc: osmEmbedSrc(school.lat, school.lng),
    osmSearchUrl: osmSearchUrl(school.address, school.city),
    portalPath: portalPath(school.slug),
    portalUrl: portalUrl(school.slug),
    loginUrl: '/auth/login',
    payUrl: '/auth/login',
  };
}

function leakMarkers() {
  return [
    'matricule',
    'bulletin',
    'classement',
    'moyenne',
    'palmarès',
    'palmares',
    'note /20',
    'rang ',
  ];
}

module.exports = {
  SITE_ORIGIN,
  CONTACT_INBOX,
  PUBLIC_SCHOOL_SELECT,
  RESERVED_SLUGS,
  isReservedSlug,
  isPortalSlug,
  portalPath,
  portalUrl,
  parseLat,
  parseLng,
  parsePublicPortalFields,
  osmEmbedSrc,
  osmSearchUrl,
  cycleFilterOptions,
  seoForSchool,
  seoForMarketplace,
  sanitizeContact,
  publicSchoolView,
  leakMarkers,
};
