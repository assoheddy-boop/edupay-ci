const fs = require('fs');
const path = require('path');
const { putObject } = require('../../services/StorageService');

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

function getLogoDir() {
  return path.join(__dirname, '../../uploads/logos');
}

function ensureLogoDir() {
  const dir = getLogoDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function publicPathFromLogoFile(logoFile) {
  if (!logoFile) return null;
  const normalized = String(logoFile).replace(/\\/g, '/');
  if (normalized.startsWith('public/')) return `/${normalized.slice('public/'.length)}`;
  return null;
}

function logoSrcFor(school) {
  if (!school) return null;
  const url = school.logoUrl || '';
  if (url.startsWith('/img/') || url.startsWith('http://') || url.startsWith('https://')) return url;

  try {
    const { EPV_SCHOOLS } = require('../config/epvSchools');
    const catalog = EPV_SCHOOLS.find((s) => s.slug && s.slug === school.slug);
    const fromCatalog = publicPathFromLogoFile(catalog?.logoFile);
    if (fromCatalog) return fromCatalog;
  } catch {
    // ignore
  }

  try {
    const { findExtraSchool } = require('../config/extraSchools');
    const fromExtra = publicPathFromLogoFile(findExtraSchool(school.slug)?.logoFile);
    if (fromExtra) return fromExtra;
  } catch {
    // ignore
  }

  if (url && !url.startsWith('/uploads/')) return url;

  const b64 = school.logoBase64 || '';
  if (b64.startsWith('data:') && b64.length < 120000) return b64;
  return null;
}

function readLogoFileFromUrl(url) {
  if (!url || url.startsWith('http://') || url.startsWith('https://')) return null;

  let filePath;
  if (url.startsWith('/img/')) {
    filePath = path.join(__dirname, '../..', 'public', url.slice(1));
  } else if (url.startsWith('/uploads/')) {
    filePath = path.join(__dirname, '../..', url);
  } else {
    return null;
  }

  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

function readCatalogLogoBuffer(slug, { secondary = false } = {}) {
  if (!slug) return null;
  const key = secondary ? 'secondaryLogoFile' : 'logoFile';

  try {
    const { EPV_SCHOOLS } = require('../config/epvSchools');
    const epv = EPV_SCHOOLS.find((s) => s.slug === slug);
    const fromEpv = publicPathFromLogoFile(epv?.[key]);
    if (fromEpv) return readLogoFileFromUrl(fromEpv);
  } catch {
    // ignore
  }

  try {
    const { findExtraSchool } = require('../config/extraSchools');
    const extra = findExtraSchool(slug);
    const fromExtra = publicPathFromLogoFile(extra?.[key]);
    if (fromExtra) return readLogoFileFromUrl(fromExtra);
  } catch {
    // ignore
  }

  return null;
}

function resolveLogoBuffer(school) {
  if (!school) return null;

  if (school.logoBase64) {
    const match = school.logoBase64.match(/^data:image\/\w+;base64,(.+)$/);
    const raw = match ? match[1] : school.logoBase64;
    try {
      return Buffer.from(raw, 'base64');
    } catch {
      return null;
    }
  }

  const fromUrl = readLogoFileFromUrl(school.logoUrl);
  if (fromUrl) return fromUrl;

  if (school.logoUrl?.startsWith('/uploads/')) {
    const logoPath = path.join(__dirname, '../..', school.logoUrl);
    if (fs.existsSync(logoPath)) {
      try {
        return fs.readFileSync(logoPath);
      } catch {
        return null;
      }
    }
  }

  return readCatalogLogoBuffer(school.slug);
}

function resolveSecondaryLogoBuffer(school) {
  if (!school) return null;

  if (school.secondaryLogoBase64) {
    const match = school.secondaryLogoBase64.match(/^data:image\/\w+;base64,(.+)$/);
    const raw = match ? match[1] : school.secondaryLogoBase64;
    try {
      return Buffer.from(raw, 'base64');
    } catch {
      return null;
    }
  }

  const fromUrl = readLogoFileFromUrl(school.secondaryLogoUrl);
  if (fromUrl) return fromUrl;

  if (school.secondaryLogoUrl?.startsWith('/uploads/')) {
    const logoPath = path.join(__dirname, '../..', school.secondaryLogoUrl);
    if (fs.existsSync(logoPath)) {
      try {
        return fs.readFileSync(logoPath);
      } catch {
        return null;
      }
    }
  }

  return readCatalogLogoBuffer(school.slug, { secondary: true });
}

function secondaryLogoSrcFor(school) {
  if (!school) return null;
  const url = school.secondaryLogoUrl || '';
  if (url.startsWith('/img/') || url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url && !url.startsWith('/uploads/')) return url;

  try {
    const { EPV_SCHOOLS } = require('../config/epvSchools');
    const catalog = EPV_SCHOOLS.find((s) => s.slug && s.slug === school.slug);
    const fromCatalog = publicPathFromLogoFile(catalog?.secondaryLogoFile);
    if (fromCatalog) return fromCatalog;
  } catch {
    // ignore
  }

  try {
    const { findExtraSchool } = require('../config/extraSchools');
    const fromExtra = publicPathFromLogoFile(findExtraSchool(school.slug)?.secondaryLogoFile);
    if (fromExtra) return fromExtra;
  } catch {
    // ignore
  }

  const b64 = school.secondaryLogoBase64 || '';
  if (b64.startsWith('data:') && b64.length < 120000) return b64;
  return null;
}

function drawSecondarySchoolLogo(doc, school, { x = 50, y = 45, width = 60 } = {}) {
  const buffer = resolveSecondaryLogoBuffer(school);
  if (!buffer) return false;

  try {
    doc.image(buffer, x, y, { width });
    return true;
  } catch {
    return false;
  }
}

function drawSchoolLogo(doc, school, { x = 50, y = 45, width = 60 } = {}) {
  const buffer = resolveLogoBuffer(school);
  if (!buffer) return false;

  try {
    doc.image(buffer, x, y, { width });
    return true;
  } catch {
    return false;
  }
}

function drawDocumentHeader(doc, school, { title, subtitle, y = 45, logoWidth = 60 } = {}) {
  const x = 50;
  const hasLogo = drawSchoolLogo(doc, school, { x, y, width: logoWidth });
  const textX = hasLogo ? x + logoWidth + 15 : x;
  const textY = hasLogo ? y + 8 : y;
  const headerSubtitle = subtitle
    || [school?.address, school?.city].filter(Boolean).join(' — ')
    || null;

  doc.fontSize(hasLogo ? 16 : 20).fillColor('#0052CC').text(school?.name || 'EduConnect', textX, textY, {
    width: 500 - (textX - x),
  });

  if (headerSubtitle) {
    doc.fontSize(10).fillColor('#666').text(headerSubtitle, textX, doc.y + 2);
  }

  if (title) {
    doc.moveDown(hasLogo ? 1.5 : 1);
    doc.fontSize(14).fillColor('#333').text(title, { align: 'center' });
  }

  doc.moveDown();
}

async function saveSecondarySchoolLogo(schoolId, file) {
  if (!file?.buffer) throw new Error('Fichier logo secondaire invalide');

  const ext = path.extname(file.originalname).toLowerCase() || '.png';
  if (!ALLOWED_EXT.includes(ext)) {
    throw new Error('Format non supporté. Utilisez JPG, PNG ou WebP.');
  }

  const filename = `${schoolId}-secondary${ext}`;
  const mime = file.mimetype || 'image/png';
  const stored = await putObject({
    folder: 'logos',
    filename,
    buffer: file.buffer,
    contentType: mime,
  });

  const secondaryLogoBase64 = `data:${mime};base64,${file.buffer.toString('base64')}`;
  return { secondaryLogoUrl: stored.url, secondaryLogoBase64 };
}

function removeSecondarySchoolLogoFiles(schoolId) {
  ensureLogoDir();
  for (const e of ALLOWED_EXT) {
    const p = path.join(getLogoDir(), `${schoolId}-secondary${e}`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

async function saveSchoolLogo(schoolId, file) {
  if (!file?.buffer) throw new Error('Fichier logo invalide');

  const ext = path.extname(file.originalname).toLowerCase() || '.png';
  if (!ALLOWED_EXT.includes(ext)) {
    throw new Error('Format non supporté. Utilisez JPG, PNG ou WebP.');
  }

  const filename = `${schoolId}${ext}`;
  const mime = file.mimetype || 'image/png';
  const stored = await putObject({
    folder: 'logos',
    filename,
    buffer: file.buffer,
    contentType: mime,
  });

  const logoBase64 = `data:${mime};base64,${file.buffer.toString('base64')}`;
  return { logoUrl: stored.url, logoBase64 };
}

function removeSchoolLogoFiles(schoolId) {
  ensureLogoDir();
  for (const e of ALLOWED_EXT) {
    const p = path.join(getLogoDir(), `${schoolId}${e}`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

function saveOrgLogo(organizationId, file) {
  return saveSchoolLogo(`org-${organizationId}`, file);
}

function removeOrgLogoFiles(organizationId) {
  removeSchoolLogoFiles(`org-${organizationId}`);
}

module.exports = {
  drawSchoolLogo,
  drawSecondarySchoolLogo,
  drawDocumentHeader,
  resolveLogoBuffer,
  resolveSecondaryLogoBuffer,
  logoSrcFor,
  secondaryLogoSrcFor,
  publicPathFromLogoFile,
  saveSchoolLogo,
  saveSecondarySchoolLogo,
  removeSchoolLogoFiles,
  removeSecondarySchoolLogoFiles,
  saveOrgLogo,
  removeOrgLogoFiles,
};
