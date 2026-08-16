const SMS_OFFICIAL_MODULE = 'sms_official';
const DEFAULT_SENDER = 'EduConnect';

function sanitizeSmsSenderId(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (/[<>'"\\]/.test(value)) return null;
  const cleaned = value.replace(/[^\w+\- ]/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 20);
}

function prefixSmsBody(schoolName, body) {
  const text = String(body || '').trim();
  const name = String(schoolName || '').trim();
  if (!text) return text;
  if (!name) return text;
  const prefix = `École ${name} : `;
  const asciiPrefix = `Ecole ${name} : `;
  if (text.startsWith(prefix) || text.startsWith(asciiPrefix)) return text;
  return `${prefix}${text}`;
}

function resolveSmsSender({ snapshot, school } = {}) {
  const fromJob = sanitizeSmsSenderId(snapshot);
  const fromSchool = sanitizeSmsSenderId(school?.smsSenderId);
  const fromEnv = sanitizeSmsSenderId(process.env.ORANGE_SMS_SENDER) || DEFAULT_SENDER;
  return fromJob || fromSchool || fromEnv;
}

function canAccessSchoolJobs(user, schoolId) {
  if (!user || !schoolId) return false;
  if (user.school?.id && user.school.id === schoolId) {
    if (user.role === 'SCHOOL_ADMIN') return true;
    if (user.role === 'SUPER_ADMIN' && user.adminAssist?.type === 'school') return true;
  }
  return false;
}

function smsPreviewExample(schoolName) {
  return prefixSmsBody(schoolName || '[nom de l\'école]', "votre enfant est absent aujourd'hui.");
}

module.exports = {
  SMS_OFFICIAL_MODULE,
  DEFAULT_SENDER,
  sanitizeSmsSenderId,
  prefixSmsBody,
  resolveSmsSender,
  canAccessSchoolJobs,
  smsPreviewExample,
};
