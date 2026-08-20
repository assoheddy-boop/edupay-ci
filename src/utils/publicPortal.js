const { parseEducationCycle, CYCLE_LABELS, EDUCATION_CYCLE_OPTIONS } = require('./educationCycle');
const { isDangerousUpload } = require('./uploadSafety');
const { parseMarketplaceTier, marketplaceBadge, educonnectVerifiedBadge } = require('./marketplaceAddon');

const SITE_ORIGIN = (process.env.APP_URL || 'https://educonnect-ci.com').replace(/\/$/, '');
const CONTACT_INBOX = 'contact@educonnect.ci';
const DEFAULT_OG_IMAGE_PATH = '/images/og-educonnect-share.jpg';
const DEFAULT_OG_IMAGE_WIDTH = 1200;
const DEFAULT_OG_IMAGE_HEIGHT = 630;

function defaultOgImage() {
  return `${SITE_ORIGIN}${DEFAULT_OG_IMAGE_PATH}`;
}

const PUBLIC_ROBOTS = 'index, follow';
const PRIVATE_ROBOTS = 'noindex, nofollow';
const NOINDEX_PATH_PREFIXES = [
  '/auth',
  '/school',
  '/parent',
  '/teacher',
  '/admin',
  '/group',
  '/hr',
  '/api',
  '/transfer',
  '/class',
  '/stats',
  '/reinscription',
  '/redoublement',
  '/timetable',
  '/offline',
  '/metrics',
];

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
  commune: true,
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
  'tarifs',
  'tarification',
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

function organizationPortalPath(slug) {
  return `/e/groupe/${encodeURIComponent(String(slug || '').toLowerCase())}`;
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
  const commune = String(body.commune || '').trim().slice(0, 80);
  const bannerUrl = sanitizeImageUrl(body.publicBanner);
  const type = parsePublicType(body.publicType) || PUBLIC_TYPE.PRIVE;
  const data = {
    publicPortalEnabled: parseCheckbox(body.publicPortalEnabled),
    publicDescription: description || null,
    publicLife: life || null,
    publicPhone: phone || null,
    commune: commune || null,
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
  const parts = [];
  const seen = new Set();
  for (const raw of [address, city, 'Côte d\'Ivoire']) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const key = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (seen.has(key) || [...seen].some((item) => item.includes(key) || key.includes(item))) continue;
    seen.add(key);
    parts.push(value);
  }
  if (!parts.length) return null;
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(parts.join(', '))}`;
}

function osmDirectionsUrl(lat, lng) {
  if (lat == null || lng == null) return null;
  return `https://www.openstreetmap.org/directions?from=&to=${encodeURIComponent(`${lat},${lng}`)}`;
}

function geoUrl(lat, lng) {
  if (lat == null || lng == null) return null;
  return `geo:${lat},${lng}`;
}

/** Approximate centres for Abidjan communes (OpenStreetMap, no API key). */
const ABIDJAN_COMMUNE_CENTERS = {
  abobo: [5.4164, -4.0239],
  adjame: [5.3503, -4.0269],
  attécoubé: [5.3294, -4.0451],
  attecoube: [5.3294, -4.0451],
  cocody: [5.3599, -4.0083],
  koumassi: [5.2892, -4.0031],
  marcory: [5.3091, -4.0124],
  plateau: [5.3220, -4.0160],
  'port-bouet': [5.2546, -3.9242],
  'port-bouët': [5.2546, -3.9242],
  treichville: [5.2984, -4.0150],
  yopougon: [5.3364, -4.0644],
  bingerville: [5.3556, -3.8944],
  songon: [5.2960, -4.2530],
};

const CITY_CENTERS = {
  abidjan: [5.3364, -4.0267],
  bouake: [7.6939, -5.0303],
  bouaké: [7.6939, -5.0303],
  bingerville: [5.3556, -3.8944],
  korhogo: [9.4580, -5.6296],
  yamoussoukro: [6.8276, -5.2893],
};

function communeCenterLookup(label) {
  const folded = foldAscii(label);
  if (!folded) return null;
  if (ABIDJAN_COMMUNE_CENTERS[folded]) return ABIDJAN_COMMUNE_CENTERS[folded];
  for (const [key, coords] of Object.entries(ABIDJAN_COMMUNE_CENTERS)) {
    if (folded.includes(key) || key.includes(folded)) return coords;
  }
  return null;
}

function cityCenterLookup(label) {
  const folded = foldAscii(label);
  if (!folded) return null;
  return CITY_CENTERS[folded] || null;
}

function resolveSchoolMapPosition(school) {
  if (school?.lat != null && school?.lng != null) {
    return { lat: Number(school.lat), lng: Number(school.lng), source: 'gps' };
  }
  const { commune, city } = schoolLocality(school);
  const fromCommune = communeCenterLookup(commune);
  if (fromCommune) {
    return { lat: fromCommune[0], lng: fromCommune[1], source: 'commune' };
  }
  const fromCity = cityCenterLookup(city);
  if (fromCity) {
    return { lat: fromCity[0], lng: fromCity[1], source: 'city' };
  }
  return null;
}

function publicSchoolMapMarker(school) {
  if (!school?.slug) return null;
  const view = publicSchoolView(school, { includeBase64: false });
  if (!view) return null;
  const position = resolveSchoolMapPosition(school);
  if (!position) return null;
  return {
    slug: view.slug,
    name: view.name,
    cycleLabel: view.cycleLabel,
    localityLabel: view.localityLabel,
    portalPath: view.portalPath,
    lat: position.lat,
    lng: position.lng,
    source: position.source,
  };
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

function foldAscii(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function robotsForPath(pathname) {
  const path = String(pathname || '').split('?')[0];
  if (NOINDEX_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return PRIVATE_ROBOTS;
  }
  return PUBLIC_ROBOTS;
}

function schoolLegalName(school) {
  const explicit = String(school?.legalName || '').trim();
  if (explicit) return explicit;
  try {
    const { IGEST_SCHOOL } = require('../config/igestSchool');
    if (school?.slug && IGEST_SCHOOL.slug && String(school.slug) === IGEST_SCHOOL.slug) {
      return String(IGEST_SCHOOL.legalName || IGEST_SCHOOL.name || '').trim();
    }
  } catch {
    /* config optional */
  }
  return String(school?.name || 'École').trim() || 'École';
}

function schoolHeading(school) {
  const name = String(school?.name || '').trim();
  const legal = schoolLegalName(school);
  if (legal && name && legal.length > name.length) return legal;
  return name || legal || 'École';
}

function schoolLocality(school) {
  const communeField = String(school?.commune || '').trim();
  const city = String(school?.city || '').trim();
  if (communeField) {
    return { commune: communeField, city: city || null };
  }
  const campus = String(school?.campusLabel || '').trim();
  if (campus && (!city || foldAscii(campus) !== foldAscii(city))) {
    return { commune: campus, city: city || null };
  }
  return { commune: null, city: city || null };
}

function localityPhrase(school) {
  const { commune, city } = schoolLocality(school);
  const parts = [];
  if (commune) parts.push(commune);
  if (city && !parts.some((part) => {
    const a = foldAscii(part);
    const b = foldAscii(city);
    return a === b || a.includes(b);
  })) {
    parts.push(city);
  }
  return parts.join(', ') || 'Côte d’Ivoire';
}

function primaryLocality(school) {
  const { commune, city } = schoolLocality(school);
  return commune || city || null;
}

function cycleListing(cycle) {
  const value = cycle ? parseEducationCycle(cycle) : null;
  if (value === 'PRIMAIRE') {
    return { heading: 'Écoles primaires', one: 'école primaire', title: 'Primaire' };
  }
  if (value === 'COLLEGE') {
    return { heading: 'Collèges', one: 'collège', title: 'Collège' };
  }
  if (value === 'LYCEE') {
    return { heading: 'Lycées', one: 'lycée', title: 'Lycée' };
  }
  if (value === 'MIXTE') {
    return { heading: 'Écoles (plusieurs cycles)', one: 'établissement', title: 'Établissement' };
  }
  return { heading: 'Écoles', one: 'établissement', title: 'Établissement' };
}

function cycleArticlePhrase(cycle) {
  const value = parseEducationCycle(cycle);
  if (value === 'PRIMAIRE') return 'une école primaire';
  if (value === 'COLLEGE') return 'un collège';
  if (value === 'LYCEE') return 'un lycée';
  if (value === 'MIXTE') return 'un établissement (primaire et secondaire)';
  return 'un établissement';
}

function publicCopyForSchool(school, extras = {}) {
  const heading = schoolHeading(school);
  const cycle = CYCLE_LABELS[parseEducationCycle(school?.educationCycle)] || 'établissement';
  const type = PUBLIC_TYPE_LABELS[parsePublicType(school?.publicType) || PUBLIC_TYPE.PRIVE];
  const locality = localityPhrase(school);
  const fromDesc = String(school?.publicDescription || '').replace(/\s+/g, ' ').trim();
  const presentation = fromDesc
    || `${heading} est ${cycleArticlePhrase(school?.educationCycle)} à ${locality}, Côte d’Ivoire. Page publique EduConnect : présentation et contact. Les notes et bulletins restent dans l’espace parent.`;
  const cycleBits = [`Cycle d’enseignement : ${cycle}`];
  if (type) cycleBits.push(`Type : ${type}`);
  if (extras.classCount != null) {
    const n = Number(extras.classCount);
    cycleBits.push(`${n} classe${n > 1 ? 's' : ''} (effectif anonymisé, sans noms d’élèves)`);
  }
  return {
    presentation,
    cycles: cycleBits.join(' · '),
    activities: String(school?.publicLife || '').replace(/\s+/g, ' ').trim() || null,
  };
}

function seoPlaceClause(school) {
  const place = primaryLocality(school);
  if (!place) return 'en Côte d’Ivoire';
  return `à ${place}, Côte d’Ivoire`;
}

function seoForSchool(school, extras = {}) {
  const cycle = CYCLE_LABELS[parseEducationCycle(school?.educationCycle)] || 'établissement';
  const name = String(school?.name || schoolHeading(school) || 'École').trim();
  const legal = schoolLegalName(school);
  const locality = localityPhrase(school);
  const title = `${name} — ${cycle} ${seoPlaceClause(school)}`;
  const fromDesc = String(school?.publicDescription || '').replace(/\s+/g, ' ').trim();
  const news = newsTitlesFrom(extras.news || extras.newsTitles || extras.posts);
  const base = fromDesc
    || `${legal}, ${String(cycle).toLowerCase()} à ${locality}, Côte d’Ivoire. Page officielle sur EduConnect. Notes et bulletins dans l’espace parent.`;
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
    robots: PUBLIC_ROBOTS,
  };
}

function marketplacePath({ ville, commune, cycle, type, q, page } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', String(q).trim());
  if (ville) params.set('ville', String(ville).trim());
  if (commune) params.set('commune', String(commune).trim());
  if (cycle) params.set('cycle', String(cycle).trim().toUpperCase());
  if (type) params.set('type', String(type).trim().toUpperCase());
  const pageNum = Math.max(1, parseInt(String(page || '1'), 10) || 1);
  if (pageNum > 1) params.set('page', String(pageNum));
  const query = params.toString();
  return query ? `/ecoles?${query}` : '/ecoles';
}

function verifiedMarketplacePath({ page } = {}) {
  const pageNum = Math.max(1, parseInt(String(page || '1'), 10) || 1);
  return pageNum > 1 ? `/ecoles/verifies?page=${pageNum}` : '/ecoles/verifies';
}

function seoForMarketplace({
  ville,
  commune,
  cycle,
  type,
  q,
  page,
  heading: headingOverride,
  lead: leadOverride,
  canonicalPath,
} = {}) {
  const nameQuery = String(q || '').trim();
  const villeLabel = String(ville || '').trim();
  const communeLabel = String(commune || '').trim();
  const placeLabel = communeLabel
    ? (villeLabel && foldAscii(communeLabel) !== foldAscii(villeLabel) ? `${communeLabel}, ${villeLabel}` : communeLabel)
    : villeLabel;
  const cycleKey = cycle && String(cycle).trim()
    && parseEducationCycle(cycle) === String(cycle).trim().toUpperCase()
    ? String(cycle).trim().toUpperCase()
    : '';
  const noun = cycleKey ? cycleListing(cycleKey) : null;
  const parsedType = parsePublicType(type);
  const typeLabel = parsedType ? PUBLIC_TYPE_LABELS[parsedType] : null;

  let heading;
  let title;
  let lead;
  if (headingOverride) {
    heading = headingOverride;
    title = `${headingOverride} — Côte d’Ivoire`;
    lead = leadOverride || `${headingOverride}. Annuaire EduConnect ; notes dans l’espace parent.`;
  } else if (noun && placeLabel) {
    heading = `${noun.heading} à ${placeLabel}`;
    title = `${noun.heading} à ${placeLabel} — Côte d’Ivoire`;
    lead = `${noun.heading} à ${placeLabel}, Côte d’Ivoire. Pages publiques EduConnect ; notes et bulletins dans l’espace parent.`;
  } else if (noun) {
    heading = `${noun.heading} en Côte d’Ivoire`;
    title = `${noun.heading} en Côte d’Ivoire — enseignement`;
    lead = `${noun.heading} en Côte d’Ivoire, publiés sur EduConnect. Présentation et contact ; résultats scolaires derrière connexion parent.`;
  } else if (placeLabel) {
    heading = `Écoles à ${placeLabel}`;
    title = `Écoles à ${placeLabel} — Côte d’Ivoire`;
    lead = `Écoles, collèges et lycées à ${placeLabel}, Côte d’Ivoire. Annuaire EduConnect, sans notes nominatives.`;
  } else if (nameQuery) {
    heading = `Résultats pour « ${nameQuery} »`;
    title = `Écoles « ${nameQuery} » — Côte d’Ivoire`;
    lead = `Recherche « ${nameQuery} » dans l’annuaire EduConnect. Pages publiques sans notes nominatives.`;
  } else {
    heading = 'Écoles en Côte d’Ivoire';
    title = 'Écoles en Côte d’Ivoire — collèges et lycées';
    lead = 'Annuaire des écoles, collèges et lycées en Côte d’Ivoire. Chaque établissement publie sa page. Les résultats scolaires restent derrière connexion parent.';
  }
  if (typeLabel) heading = `${heading} · ${typeLabel}`;
  const pageNum = Math.max(1, parseInt(String(page || '1'), 10) || 1);
  if (pageNum > 1 && !headingOverride) {
    title = `${title} — page ${pageNum}`;
  }
  const description = lead.replace(/\s+/g, ' ').trim().slice(0, 160);
  const canonicalUrl = canonicalPath
    ? `${SITE_ORIGIN}${canonicalPath}${pageNum > 1 ? `?page=${pageNum}` : ''}`
    : `${SITE_ORIGIN}${marketplacePath({
      q: nameQuery,
      ville: villeLabel,
      commune: communeLabel,
      cycle: cycleKey,
      type: parsedType || '',
      page: pageNum,
    })}`;
  return {
    title,
    heading,
    lead,
    metaDescription: description,
    canonicalUrl,
    ogTitle: title,
    ogDescription: description,
    ogImage: `${SITE_ORIGIN}/icons/icon-192.png`,
    robots: PUBLIC_ROBOTS,
  };
}

function seoForHome() {
  const title = 'Gestion scolaire et écoles en Côte d’Ivoire';
  const metaDescription =
    'EduConnect : gestion scolaire, suivi parental et correspondance scolaire Côte d’Ivoire–France. Wave, Orange Money, portail public. Notes et bulletins dans l’espace parent.';
  return {
    title,
    metaDescription,
    canonicalUrl: `${SITE_ORIGIN}/`,
    ogTitle: 'EduConnect — La plateforme scolaire numérique de référence',
    ogDescription: metaDescription,
    ogImage: defaultOgImage(),
    ogImageWidth: DEFAULT_OG_IMAGE_WIDTH,
    ogImageHeight: DEFAULT_OG_IMAGE_HEIGHT,
    ogLocale: 'fr_FR',
    robots: PUBLIC_ROBOTS,
  };
}

function seoForTarifs() {
  const title = 'Nos tarifs';
  const metaDescription =
    'Tarifs EduConnect pour écoles agréées en Côte d’Ivoire : primaire 50 000 FCFA/an, collège 80 000 FCFA/an, contribution parentale 2 500 FCFA/an. Lycées publics sur convention.';
  return {
    title,
    metaDescription,
    canonicalUrl: `${SITE_ORIGIN}/tarifs`,
    ogTitle: 'Nos tarifs — EduConnect',
    ogDescription: metaDescription,
    ogImage: defaultOgImage(),
    ogImageWidth: DEFAULT_OG_IMAGE_WIDTH,
    ogImageHeight: DEFAULT_OG_IMAGE_HEIGHT,
    ogLocale: 'fr_FR',
    robots: PUBLIC_ROBOTS,
  };
}

function jsonLdSameAs(school, extras = {}) {
  const raw = extras.sameAs || school?.sameAs || school?.publicLinks;
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const url = String(item || '').trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function jsonLdForSchool(school, extras = {}) {
  const seo = seoForSchool(school, extras);
  const legal = schoolLegalName(school);
  const shortName = String(school?.name || '').trim();
  const { commune, city } = schoolLocality(school);
  const logo = absoluteAssetUrl(school?.logoUrl);
  const image = seo.ogImage || logo;
  const data = {
    '@context': 'https://schema.org',
    '@type': ['EducationalOrganization', 'LocalBusiness', 'School'],
    name: legal,
    url: portalUrl(school?.slug),
    description: seo.metaDescription,
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'CI',
    },
  };
  if (shortName && shortName !== legal) data.alternateName = shortName;
  if (legal && shortName && legal !== shortName) data.legalName = legal;
  const locality = commune || city;
  if (locality) data.address.addressLocality = locality;
  if (commune && city && foldAscii(commune) !== foldAscii(city)) {
    data.address.addressRegion = city;
  }
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
  const sameAs = jsonLdSameAs(school, extras);
  if (sameAs.length) data.sameAs = sameAs;
  return data;
}

function jsonLdForMarketplace(schools, seo = {}) {
  const items = (Array.isArray(schools) ? schools : []).slice(0, 50);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: seo.heading || seo.title || 'Écoles en Côte d’Ivoire',
    description: seo.metaDescription,
    url: seo.canonicalUrl || `${SITE_ORIGIN}/ecoles`,
    isPartOf: { '@type': 'WebSite', name: 'EduConnect', url: SITE_ORIGIN },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.map((row, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: row.portalUrl || portalUrl(row.slug),
        name: row.heading || row.name,
      })),
    },
  };
}

function jsonLdForHome() {
  const seo = seoForHome();
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'EduConnect',
    url: SITE_ORIGIN,
    description: seo.metaDescription,
    areaServed: { '@type': 'Country', name: 'Côte d’Ivoire' },
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

const COMPARE_MAX = 3;
const COMPARE_COOKIE = 'ec_compare';

function parseCompareSlugs(raw) {
  const seen = new Set();
  const slugs = [];
  String(raw || '').split(',').forEach((part) => {
    const slug = String(part || '').trim().toLowerCase();
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    slugs.push(slug);
  });
  return slugs.slice(0, COMPARE_MAX);
}

function compareSlugsFromCookie(cookies = {}) {
  return parseCompareSlugs(cookies[COMPARE_COOKIE]);
}

function addCompareSlug(existingRaw, slug) {
  const slugNorm = String(slug || '').trim().toLowerCase();
  const slugs = parseCompareSlugs(existingRaw).filter((s) => s !== slugNorm);
  if (slugNorm) slugs.unshift(slugNorm);
  return slugs.slice(0, COMPARE_MAX);
}

function removeCompareSlug(existingRaw, slug) {
  const slugNorm = String(slug || '').trim().toLowerCase();
  return parseCompareSlugs(existingRaw).filter((s) => s !== slugNorm);
}

function compareSlugsParam(raw) {
  return parseCompareSlugs(raw).join(',');
}

function sanitizeReview(body = {}) {
  const honeypot = String(body.website || body.company || '').trim();
  const authorName = String(body.authorName || body.name || '').trim().slice(0, 120);
  const ratingRaw = Number.parseInt(String(body.rating || ''), 10);
  const comment = String(body.comment || '').trim().slice(0, 2000);
  const errors = [];
  if (honeypot) return { ok: false, spam: true, errors: [] };
  if (!authorName) errors.push('Indiquez votre prénom ou pseudo.');
  if (!Number.isFinite(ratingRaw) || ratingRaw < 1 || ratingRaw > 5) {
    errors.push('Choisissez une note entre 1 et 5.');
  }
  if (comment.length < 10) errors.push('Le commentaire est trop court (10 caractères minimum).');
  return {
    ok: errors.length === 0,
    spam: false,
    errors,
    authorName,
    rating: ratingRaw,
    comment,
  };
}

function publicReviewView(review) {
  if (!review) return null;
  return {
    id: review.id,
    authorName: review.authorName,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
  };
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
  const locality = schoolLocality(school);
  const classCount = extras.classCount != null ? extras.classCount : null;
  return {
    name: school.name,
    heading: schoolHeading(school),
    legalName: schoolLegalName(school),
    slug: school.slug,
    city: school.city,
    commune: locality.commune,
    localityLabel: localityPhrase(school),
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
    verifiedBadge: educonnectVerifiedBadge(school),
    lat: school.lat,
    lng: school.lng,
    classCount,
    copy: publicCopyForSchool(school, { classCount }),
    osmEmbedSrc: osmEmbedSrc(school.lat, school.lng),
    osmSearchUrl: osmSearchUrl(school.address || locality.commune, school.city),
    osmDirectionsUrl: osmDirectionsUrl(school.lat, school.lng),
    geoUrl: geoUrl(school.lat, school.lng),
    whatsappUrl: whatsappUrl(school.publicPhone),
    portalPath: portalPath(school.slug),
    portalUrl: portalUrl(school.slug),
    loginUrl: school.slug ? `${portalPath(school.slug)}/go/connexion` : '/auth/login',
    payUrl: school.slug ? `${portalPath(school.slug)}/go/payer` : '/auth/login',
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
  PUBLIC_ROBOTS,
  PRIVATE_ROBOTS,
  RESERVED_SLUGS,
  MAX_GALLERY,
  isReservedSlug,
  isPortalSlug,
  portalPath,
  portalUrl,
  organizationPortalPath,
  marketplacePath,
  verifiedMarketplacePath,
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
  ABIDJAN_COMMUNE_CENTERS,
  resolveSchoolMapPosition,
  publicSchoolMapMarker,
  cycleFilterOptions,
  typeFilterOptions,
  robotsForPath,
  schoolLegalName,
  schoolHeading,
  schoolLocality,
  localityPhrase,
  publicCopyForSchool,
  seoForSchool,
  seoForMarketplace,
  seoForHome,
  seoForTarifs,
  jsonLdForSchool,
  jsonLdForMarketplace,
  jsonLdForHome,
  sanitizeContact,
  sanitizeReview,
  publicReviewView,
  COMPARE_MAX,
  COMPARE_COOKIE,
  parseCompareSlugs,
  compareSlugsFromCookie,
  addCompareSlug,
  removeCompareSlug,
  compareSlugsParam,
  parsePortalPostInput,
  publicPostView,
  publicSchoolView,
  savePortalImage,
  leakMarkers,
};
