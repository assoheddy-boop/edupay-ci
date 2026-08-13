const fs = require('fs');
const path = require('path');

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

function getLogoDir() {
  return path.join(__dirname, '../../uploads/logos');
}

function ensureLogoDir() {
  const dir = getLogoDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
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

  return null;
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

  doc.fontSize(hasLogo ? 16 : 20).fillColor('#0052CC').text(school?.name || 'EduPay CI', textX, textY, {
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

function saveSchoolLogo(schoolId, file) {
  if (!file?.buffer) throw new Error('Fichier logo invalide');

  const ext = path.extname(file.originalname).toLowerCase() || '.png';
  if (!ALLOWED_EXT.includes(ext)) {
    throw new Error('Format non supporté. Utilisez JPG, PNG ou WebP.');
  }

  ensureLogoDir();

  for (const e of ALLOWED_EXT) {
    const oldPath = path.join(getLogoDir(), `${schoolId}${e}`);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const filename = `${schoolId}${ext}`;
  const filepath = path.join(getLogoDir(), filename);
  fs.writeFileSync(filepath, file.buffer);

  const mime = file.mimetype || 'image/png';
  const logoBase64 = `data:${mime};base64,${file.buffer.toString('base64')}`;
  const logoUrl = `/uploads/logos/${filename}`;

  return { logoUrl, logoBase64 };
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
  drawDocumentHeader,
  resolveLogoBuffer,
  saveSchoolLogo,
  removeSchoolLogoFiles,
  saveOrgLogo,
  removeOrgLogoFiles,
};
