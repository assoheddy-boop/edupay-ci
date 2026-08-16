const path = require('path');

const DANGEROUS_EXT = /\.(svgz?|html?|xhtml|xml|js|mjs|cjs|php|phtml|exe|sh|bat|cmd|com|jar|wasm)$/i;
const DANGEROUS_MIME = /svg|html|javascript|xml|php|wasm/i;

function fileExt(file) {
  const name = file?.originalname || file?.originalName || file?.filename || '';
  return path.extname(String(name)).toLowerCase();
}

function isDangerousUpload(file) {
  if (!file) return true;
  const ext = fileExt(file);
  const mime = String(file.mimetype || file.mimeType || '').toLowerCase();
  if (DANGEROUS_EXT.test(ext)) return true;
  if (mime && DANGEROUS_MIME.test(mime)) return true;
  return false;
}

function blockedUploadPath(urlPath) {
  const ext = path.extname(String(urlPath || '')).toLowerCase();
  return DANGEROUS_EXT.test(ext);
}

module.exports = {
  DANGEROUS_EXT,
  isDangerousUpload,
  blockedUploadPath,
  fileExt,
};
