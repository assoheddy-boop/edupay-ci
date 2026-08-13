const fs = require('fs');
const path = require('path');

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const AVATARS_DIR = path.join(__dirname, '../../uploads/avatars');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function initials(firstName, lastName) {
  const a = (firstName || '').trim().charAt(0);
  const b = (lastName || '').trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
}

function inspectImage(file) {
  if (!file?.buffer && !file?.path) return { ok: false, error: 'file' };
  const original = file.originalname || file.filename || 'photo.jpg';
  const ext = path.extname(original).toLowerCase() || '.jpg';
  if (!ALLOWED_EXT.includes(ext)) return { ok: false, error: 'format' };
  return { ok: true, ext };
}

function savePersonPhoto(kind, id, file) {
  const check = inspectImage(file);
  if (!check.ok) throw new Error('Format non supporté. Utilisez JPG, PNG ou WebP.');

  ensureDir(AVATARS_DIR);
  for (const e of ALLOWED_EXT) {
    const oldPath = path.join(AVATARS_DIR, `${kind}-${id}${e}`);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const filename = `${kind}-${id}${check.ext}`;
  const filepath = path.join(AVATARS_DIR, filename);
  if (file.buffer) fs.writeFileSync(filepath, file.buffer);
  else fs.copyFileSync(file.path, filepath);

  return { photoUrl: `/uploads/avatars/${filename}` };
}

function removePersonPhoto(kind, id) {
  ensureDir(AVATARS_DIR);
  for (const e of ALLOWED_EXT) {
    const p = path.join(AVATARS_DIR, `${kind}-${id}${e}`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

module.exports = {
  initials,
  savePersonPhoto,
  removePersonPhoto,
  ALLOWED_EXT,
};
