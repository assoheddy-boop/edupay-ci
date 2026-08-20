const fs = require('fs');
const path = require('path');
const { putObject } = require('../../services/StorageService');

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

function resolveImageBuffer({ url, base64, folder }) {
  if (base64) {
    const match = String(base64).match(/^data:image\/\w+;base64,(.+)$/);
    const raw = match ? match[1] : base64;
    try {
      return Buffer.from(raw, 'base64');
    } catch {
      return null;
    }
  }
  if (url?.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, '../..', url);
    if (fs.existsSync(filePath)) {
      try {
        return fs.readFileSync(filePath);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function resolveDirectorSignatureBuffer(school) {
  if (!school) return null;
  return resolveImageBuffer({
    url: school.directorSignatureUrl,
    base64: school.directorSignatureBase64,
  });
}

function resolveDirectorStampBuffer(school) {
  if (!school) return null;
  return resolveImageBuffer({
    url: school.directorStampUrl,
    base64: school.directorStampBase64,
  });
}

async function saveBrandingImage(schoolId, file, kind) {
  if (!file?.buffer) throw new Error('Fichier invalide');
  const ext = path.extname(file.originalname).toLowerCase() || '.png';
  if (!ALLOWED_EXT.includes(ext)) {
    throw new Error('Format non supporté. Utilisez JPG, PNG ou WebP.');
  }
  const filename = `${schoolId}-${kind}${ext}`;
  const mime = file.mimetype || 'image/png';
  const stored = await putObject({
    folder: 'bulletin-branding',
    filename,
    buffer: file.buffer,
    contentType: mime,
  });
  const base64 = `data:${mime};base64,${file.buffer.toString('base64')}`;
  return { url: stored.url, base64 };
}

async function saveDirectorSignature(schoolId, file) {
  return saveBrandingImage(schoolId, file, 'signature');
}

async function saveDirectorStamp(schoolId, file) {
  return saveBrandingImage(schoolId, file, 'stamp');
}

function drawBrandingImage(doc, buffer, { x, y, width, height } = {}) {
  if (!buffer) return false;
  try {
    doc.image(buffer, x, y, { width, height: height || undefined, fit: height ? [width, height] : undefined });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  resolveDirectorSignatureBuffer,
  resolveDirectorStampBuffer,
  saveDirectorSignature,
  saveDirectorStamp,
  drawBrandingImage,
};
