function trimOrNull(value) {
  const s = String(value ?? '').trim();
  return s || null;
}

/** Nom affiché en en-tête bulletin MENET-FP. */
function bulletinSchoolName(school) {
  return trimOrNull(school?.officialName) || trimOrNull(school?.name) || '';
}

/** Ligne agrément MENAPLN (italique sur le bulletin). */
function formatAgrementLine(school) {
  const agrement = trimOrNull(school?.menetAgrement);
  if (agrement) {
    if (/agr[eé]e/i.test(agrement)) return agrement;
    return `Etablissement d'Enseignement Scolaire Agréé sous le N° ${agrement}`;
  }
  const code = trimOrNull(school?.menetCode);
  if (code) return `Code établissement MENET-FP : ${code}`;
  return null;
}

/** Ligne contact : N°CC, BP, téléphones. */
function formatContactRow(school) {
  const parts = [];
  const ncc = trimOrNull(school?.nccNumber);
  if (ncc) parts.push(`N°CC : ${ncc}`);
  const bp = trimOrNull(school?.postalAddress);
  if (bp) parts.push(`✉ ${bp}`);
  const phones = trimOrNull(school?.publicPhones) || trimOrNull(school?.publicPhone);
  if (phones) parts.push(`☎ ${phones}`);
  return parts.length ? parts.join('   ') : null;
}

function buildBulletinHeaderModel(school) {
  return {
    displayName: bulletinSchoolName(school),
    agrementLine: formatAgrementLine(school),
    educationLevels: trimOrNull(school?.educationLevels),
    contactRow: formatContactRow(school),
    dren: trimOrNull(school?.dren),
    directorName: trimOrNull(school?.directorName),
  };
}

/** Champs identité officielle depuis un formulaire POST. */
function parseSchoolOfficialFields(body = {}) {
  const data = {};
  const optional = [
    'officialName',
    'menetAgrement',
    'nccNumber',
    'postalAddress',
    'publicPhones',
    'educationLevels',
    'directorName',
  ];
  optional.forEach((key) => {
    if (body[key] !== undefined) data[key] = trimOrNull(body[key]);
  });
  if (body.menetCode !== undefined) data.menetCode = trimOrNull(body.menetCode);
  if (body.dren !== undefined) data.dren = trimOrNull(body.dren);
  return data;
}

module.exports = {
  trimOrNull,
  bulletinSchoolName,
  formatAgrementLine,
  formatContactRow,
  buildBulletinHeaderModel,
  parseSchoolOfficialFields,
};
