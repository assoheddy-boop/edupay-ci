const { parseEducationCycle, CYCLE_LABELS, EDUCATION_CYCLE_OPTIONS } = require('./educationCycle');
const { isDangerousUpload } = require('./uploadSafety');
const { parseMarketplaceTier, marketplaceBadge } = require('./marketplaceAddon');

const SITE_ORIGIN = (process.env.APP_URL || 'https://educonnect-ci.com').replace(/\/$/, '');
const CONTACT_INBOX = 'contact@educonnect.ci';

const PUBLIC_TYPE = {
  PRIVE: 'PRIVE',
  PUBLIC: 'PUBLIC',
  CONFESSIONNEL: 'CONFESSIONNEL',
};

const PUBLIC_TYPE_OPTIONS = [
  { value: PUBLIC_TYPE.PRIVE, label: 'Privé' },
  { value: PUBLIC_TYPE.PUBLIC, label: 'Public' },
  { value: PUBLIC_TYPE.CONFESSIONNEL, label: 'Confessionnel' },
];

const PUBLIC_TYPE_LABELS = Object.fromEntries(
  PUBLIC_TYPE_OPTIONS.map((opt) => [opt.value, opt.label]),
);

const PORTAL_POST_KIND = {
  NEWS: 'NEWS',
  EVENT: 'EVENT',
};

const PORTAL_POST_KIND_OPTIONS = [
  { value: PORTAL_POST_KIND.NEWS, label: 'Actualité' },
  { value: PORTAL_POST_KIND.EVENT, label: 'Événement' },
];

const PORTAL_POST_KIND_LABELS = Object.fromEntries(
  PORTAL_POST_KIND_OPTIONS.map((opt) => [opt.value, opt.label]),
);

const IMAGE_EXT_OK = /\.(jpe?g|png|webp)(\?|#|$)/i;
const SVG_RE = /\.svgz?(\?|#|$)/i;
const MAX_GALLERY = 24;

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
  publicBanner: true,
  publicGallery: true,
  publicLife: true,
  publicFeatured: true,
  marketplaceTier: true,
  publicType: true,
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
  'portail',
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

function parsePublicType(raw) {
  const upper = String(raw || '').trim().toUpperCase();
  if (PUBLIC_TYPE[upper]) return upper;
  const fold = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (fold === 'public') return PUBLIC_TYPE.PUBLIC;
  if (fold === 'confessionnel' || fold === 'religieux') return PUBLIC_TYPE.CONFESSIONNEL;
  if (fold === 'prive' || fold === 'privee' || fold === 'private') return PUBLIC_TYPE.PRIVE;
  return null;
}

function parsePortalPostKind(raw) {
  const upper = String(raw || '').trim().toUpperCase();
  if (upper === 'EVENT' || upper === 'EVENEMENT' || upper === 'ÉVÉNEMENT') return PORTAL_POST_KIND.EVENT;
  return PORTAL_POST_KIND.NEWS;
}

function absoluteAssetUrl(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return `${SITE_ORIGIN}${s}`;
  return null;
}

function sanitizeImageUrl(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > 500) return null;
  if (s.startsWith('data:')) return null;
  if (SVG_RE.test(s) || /image\/svg/i.test(s)) return null;
  if (s.startsWith('/uploads/') || s.startsWith('/img/')) {
    const ext = pathExt(s);
    if (ext && !IMAGE_EXT_OK.test(ext)) return null;
    return s;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (SVG_RE.test(u.pathname)) return null;
    const ext = pathExt(u.pathname);
    if (ext && !IMAGE_EXT_OK.test(ext)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function pathExt(url) {
  const clean = String(url || '').split('?')[0].split('#')[0];
  const dot = clean.lastIndexOf('.');
  if (dot < 0) return '';
  return clean.slice(dot).toLowerCase();
}

function parseGallery(raw) {
  if (!raw) return [];
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        list = trimmed.split(/\r?\n/);
      }
    } else {
      list = trimmed.split(/\r?\n/);
    }
  } else if (typeof raw === 'object' && Array.isArray(raw.urls)) {
    list = raw.urls;
  }
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const url = sanitizeImageUrl(typeof item === 'string' ? item : item?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_GALLERY) break;
  }
  return out;
}

function isSuperAdminUser(user) {
  return user?.role === 'SUPER_ADMIN';
}

function parseCheckbox(raw) {
  return raw === 'on' || raw === 'true' || raw === '1' || raw === true;
}

function parsePublicPortalFields(body = {}, { user } = {}) {
  const description = String(body.publicDescription || '').trim().slice(0, 2000);
  const life = String(body.publicLife || '').trim().slice(0, 4000);
  const phone = String(body.publicPhone || '').trim().slice(0, 40);
  const bannerUrl = sanitizeImageUrl(body.publicBanner);
  const type = parsePublicType(body.publicType) || PUBLIC_TYPE.PRIVE;
  const data = {
    publicPortalEnabled: parseCheckbox(body.publicPortalEnabled),
    publicDescription: description || null,
    publicLife: life || null,
    publicPhone: phone || null,
    publicBanner: bannerUrl,
    publicGallery: parseGallery(body.publicGallery),
    publicType: type,
    lat: parseLat(body.lat),
    lng: parseLng(body.lng),
  };
  if (isSuperAdminUser(user)) {
    data.publicFeatured = parseCheckbox(body.publicFeatured);
  }
  return data;
}

function whatsappUrl(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  let n = digits;
  if (n.startsWith('00225')) n = n.slice(2);
  else if (n.startsWith('225')) {
    // already international
  } else if (n.length === 10 && n.startsWith('0')) {
    n = `225${n}`;
  } else if (n.length === 8) {
    n = `2250${n}`;
  } else if (n.length === 10) {
    n = `225${n}`;
  } else {
    return null;
  }
  if (n.length < 11 || n.length > 15) return null;
  return `https://wa.me/${n}`;
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

function osmDirectionsUrl(lat, lng) {
  if (lat == null || lng == null) return null;
  return `https://www.openstreetmap.org/directions?from=&to=${encodeURIComponent(`${lat},${lng}`)}`;
}

function geoUrl(lat, lng) {
  if (lat == null || lng == null) return null;
  return `geo:${lat},${lng}`;
}

function cycleFilterOptions() {
  return EDUCATION_CYCLE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }));
}

function typeFilterOptions() {
  return PUBLIC_TYPE_OPTIONS.slice();
}

function newsTitlesFrom(posts) {
  return (Array.isArray(posts) ? posts : [])
    .map((p) => String(p?.title || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3);
}

function seoForSchool(school, extras = {}) {
  const cycle = CYCLE_LABELS[parseEducationCycle(school?.educationCycle)] || 'établissement';
  const city = school?.city || 'Côte d\'Ivoire';
  const name = school?.name || 'École';
  const title = `${name} — ${cycle} à ${city}`;
  const fromDesc = String(school?.publicDescription || '').replace(/\s+/g, ' ').trim();
  const news = newsTitlesFrom(extras.news || extras.newsTitles || extras.posts);
  const base = fromDesc || `${name}, ${cycle} à ${city}. Page officielle sur EduConnect. Notes et bulletins dans l’espace parent.`;
  const description = [base, news.length ? news.join(' · ') : '']
    .filter(Boolean)
    .join(' ')
    .slice(0, 160);
  const image = absoluteAssetUrl(school?.publicBanner)
    || absoluteAssetUrl(school?.logoUrl);
  return {
    title,
    metaDescription: description,
    canonicalUrl: portalUrl(school?.slug),
    ogTitle: title,
    ogDescription: description,
    ogImage: image,
  };
}

function seoForMarketplace({ ville, cycle, type } = {}) {
  const cycleLabel = cycle ? CYCLE_LABELS[parseEducationCycle(cycle)] : null;
  const typeLabel = type ? PUBLIC_TYPE_LABELS[parsePublicType(type) || type] : null;
  const bits = ['Écoles EduConnect', ville, cycleLabel, typeLabel].filter(Boolean);
  const title = bits.join(' — ');
  const description = ville || cycleLabel || typeLabel
    ? `Établissements EduConnect ${cycleLabel ? `(${cycleLabel})` : ''} ${typeLabel ? `· ${typeLabel}` : ''} ${ville ? `à ${ville}` : 'en Côte d’Ivoire'}. Pages publiques, sans notes ni bulletins en ligne.`
        .replace(/\s+/g, ' ')
        .trim()
    : 'Annuaire des écoles EduConnect en Côte d’Ivoire. Chaque établissement publie sa page. Les résultats scolaires restent derrière connexion parent.';
  return {
    title,
    metaDescription: description.slice(0, 160),
    canonicalUrl: `${SITE_ORIGIN}/ecoles`,
    ogTitle: title,
    ogDescription: description.slice(0, 160),
    ogImage: `${SITE_ORIGIN}/icons/icon-192.png`,
  };
}

function jsonLdForSchool(school, extras = {}) {
  const seo = seoForSchool(school, extras);
  const logo = absoluteAssetUrl(school?.logoUrl);
  const image = seo.ogImage || logo;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: school?.name || 'École',
    url: portalUrl(school?.slug),
    description: seo.metaDescription,
    address: {
      '@type': 'PostalAddress',
      addressLocality: school?.city || 'Abidjan',
      addressCountry: 'CI',
    },
  };
  if (school?.address) data.address.streetAddress = school.address;
  if (logo) data.logo = logo;
  if (image) data.image = image;
  if (school?.publicPhone) data.telephone = school.publicPhone;
  if (school?.lat != null && school?.lng != null) {
    data.geo = {
      '@type': 'GeoCoordinates',
      latitude: school.lat,
      longitude: school.lng,
    };
  }
  return data;
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

function parsePortalPostInput(body = {}) {
  const title = String(body.title || '').trim().slice(0, 160);
  const rawBody = String(body.body || '').trim().slice(0, 4000);
  const kind = parsePortalPostKind(body.kind);
  const errors = [];
  if (title.length < 3) errors.push('Titre trop court.');
  if (rawBody.length < 10) errors.push('Texte trop court.');
  let publishedAt = new Date();
  if (body.publishedAt) {
    const d = new Date(body.publishedAt);
    if (!Number.isNaN(d.getTime())) publishedAt = d;
  }
  return {
    ok: errors.length === 0,
    errors,
    title,
    body: rawBody,
    kind,
    publishedAt,
  };
}

function publicPostView(post) {
  if (!post) return null;
  const kind = parsePortalPostKind(post.kind);
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    kind,
    kindLabel: PORTAL_POST_KIND_LABELS[kind] || 'Actualité',
    publishedAt: post.publishedAt,
  };
}

function publicSchoolView(school, extras = {}) {
  if (!school) return null;
  const cycle = parseEducationCycle(school.educationCycle);
  const type = parsePublicType(school.publicType) || PUBLIC_TYPE.PRIVE;
  const gallery = parseGallery(school.publicGallery);
  const banner = sanitizeImageUrl(school.publicBanner);
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
    publicType: type,
    typeLabel: PUBLIC_TYPE_LABELS[type],
    publicDescription: school.publicDescription,
    publicLife: school.publicLife,
    publicPhone: school.publicPhone,
    publicBanner: banner,
    publicGallery: gallery,
    publicFeatured: Boolean(school.publicFeatured) || parseMarketplaceTier(school.marketplaceTier) === 'PREMIUM'
      || parseMarketplaceTier(school.marketplaceTier) === 'VIP',
    marketplaceTier: parseMarketplaceTier(school.marketplaceTier),
    marketplaceBadge: marketplaceBadge(school),
    lat: school.lat,
    lng: school.lng,
    classCount: extras.classCount != null ? extras.classCount : null,
    osmEmbedSrc: osmEmbedSrc(school.lat, school.lng),
    osmSearchUrl: osmSearchUrl(school.address, school.city),
    osmDirectionsUrl: osmDirectionsUrl(school.lat, school.lng),
    geoUrl: geoUrl(school.lat, school.lng),
    whatsappUrl: whatsappUrl(school.publicPhone),
    portalPath: portalPath(school.slug),
    portalUrl: portalUrl(school.slug),
    loginUrl: '/auth/login',
    payUrl: '/auth/login',
  };
}

async function savePortalImage(file) {
  if (!file?.buffer) return null;
  if (isDangerousUpload(file)) return null;
  const ext = pathExt(file.originalname || file.filename || '').toLowerCase();
  if (ext && !IMAGE_EXT_OK.test(ext)) return null;
  const mime = String(file.mimetype || '').toLowerCase();
  if (mime && !/^image\/(jpeg|jpg|png|webp)$/i.test(mime)) return null;
  const { putObject, uniqueFilename } = require('../../services/StorageService');
  const filename = uniqueFilename(file.originalname || 'photo.jpg');
  const stored = await putObject({
    folder: 'portal',
    filename,
    buffer: file.buffer,
    contentType: mime || 'image/jpeg',
  });
  return sanitizeImageUrl(stored.url);
}

function leakMarkers() {
  return [
    'matricule',
    'bulletin nominatif',
    'classement',
    'palmarès nominatif',
    'palmares nominatif',
    'note /20',
    'rang ',
  ];
}

module.exports = {
  SITE_ORIGIN,
  CONTACT_INBOX,
  PUBLIC_SCHOOL_SELECT,
  PUBLIC_TYPE,
  PUBLIC_TYPE_OPTIONS,
  PUBLIC_TYPE_LABELS,
  PORTAL_POST_KIND,
  PORTAL_POST_KIND_OPTIONS,
  PORTAL_POST_KIND_LABELS,
  RESERVED_SLUGS,
  MAX_GALLERY,
  isReservedSlug,
  isPortalSlug,
  portalPath,
  portalUrl,
  parseLat,
  parseLng,
  parsePublicType,
  parsePortalPostKind,
  parseGallery,
  sanitizeImageUrl,
  absoluteAssetUrl,
  parsePublicPortalFields,
  isSuperAdminUser,
  whatsappUrl,
  osmEmbedSrc,
  osmSearchUrl,
  osmDirectionsUrl,
  geoUrl,
  cycleFilterOptions,
  typeFilterOptions,
  seoForSchool,
  seoForMarketplace,
  jsonLdForSchool,
  sanitizeContact,
  parsePortalPostInput,
  publicPostView,
  publicSchoolView,
  savePortalImage,
  leakMarkers,
};
