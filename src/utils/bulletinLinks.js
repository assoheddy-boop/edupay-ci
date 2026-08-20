function isLegacyBulletinUploadUrl(url) {
  return typeof url === 'string' && url.startsWith('/uploads/bulletins/');
}

function schoolBulletinDownloadUrl(studentId, period) {
  if (!studentId) return null;
  const q = period ? `?period=${encodeURIComponent(period)}` : '';
  return `/school/bulletins/download/${studentId}${q}`;
}

function parentBulletinDownloadUrl(bulletinId) {
  if (!bulletinId) return null;
  return `/parent/bulletins/${bulletinId}/pdf`;
}

/** Prefer route URL; rewrite legacy /uploads/bulletins/ links. */
function resolveSchoolBulletinHref({ pdfUrl, studentId, period }) {
  if (studentId) return schoolBulletinDownloadUrl(studentId, period);
  if (pdfUrl && !isLegacyBulletinUploadUrl(pdfUrl)) return pdfUrl;
  return null;
}

function resolveParentBulletinHref({ pdfUrl, bulletinId, studentId, period }) {
  if (bulletinId) return parentBulletinDownloadUrl(bulletinId);
  if (studentId) return schoolBulletinDownloadUrl(studentId, period);
  if (pdfUrl && !isLegacyBulletinUploadUrl(pdfUrl)) return pdfUrl;
  return null;
}

module.exports = {
  isLegacyBulletinUploadUrl,
  schoolBulletinDownloadUrl,
  parentBulletinDownloadUrl,
  resolveSchoolBulletinHref,
  resolveParentBulletinHref,
};
