const { round2 } = require('../services/gradesAverage');
const { formatGradeCiOrDash } = require('./bulletinCiLayout');

function foldSubject(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function classifySubjectDomain(subject) {
  const f = foldSubject(subject);
  if (!f || /conduite/.test(f)) return 'AUTRES';
  if (
    /francais|franc|comp|orth|gram|exp|oral|anglais|allemand|espagnol|histoire|geo|edhc|etm|lv2|lettres|litterature|philosophie/.test(f)
  ) {
    return 'LETTRES';
  }
  if (/math|svt|physique|chimie|pc|science|biologie|technologie/.test(f)) {
    return 'SCIENCES';
  }
  return 'AUTRES';
}

function computeDomainBilans(rows) {
  const domains = { LETTRES: [], SCIENCES: [], AUTRES: [] };
  (rows || []).forEach((row) => {
    if (/conduite/i.test(row.subject || '')) return;
    const domain = classifySubjectDomain(row.subject);
    domains[domain].push(row);
  });

  const result = {};
  for (const [key, list] of Object.entries(domains)) {
    let num = 0;
    let den = 0;
    list.forEach((row) => {
      if (row.average == null) return;
      const coef = Number(row.coefficient) || 1;
      num += row.average * coef;
      den += coef;
    });
    result[key] = den ? round2(num / den) : null;
  }
  return result;
}

function publicTypeLabel(publicType) {
  const map = {
    PRIVE: 'Privé',
    PUBLIC: 'Public',
    CONFESSIONNEL: 'Confessionnel',
  };
  return map[String(publicType || '').toUpperCase()] || 'Privé';
}

function formatRepeatLabel(repeatYear) {
  if (repeatYear === true) return 'Oui';
  if (repeatYear === false) return 'Non';
  return '—';
}

function formatSchoolYearLabel(schoolYear) {
  return String(schoolYear || '').trim() || '—';
}

function formatAbsenceSummary(absences) {
  const list = Array.isArray(absences) ? absences : [];
  const days = list.filter((a) => String(a.type || 'ABSENCE').toUpperCase() !== 'LATE').length;
  const lates = list.length - days;
  if (!list.length) return '0';
  if (lates > 0) return `${days} jour(s), ${lates} retard(s)`;
  return `${days} jour(s)`;
}

function termAverageLabel(term) {
  const labels = {
    T1: 'Moyenne du 1er trimestre',
    T2: 'Moyenne du 2e trimestre',
    T3: 'Moyenne du 3e trimestre',
    ANNUELLE: 'Moyenne annuelle',
  };
  return labels[term] || 'Moyenne du trimestre';
}

function buildMenetViewModel({
  school,
  student,
  rows,
  average,
  rank,
  classSize,
  classStats,
  domainBilans,
  absences,
  mention,
  decision,
  term,
  periodLabel,
  homeroomTeacherName,
  repeatYear,
}) {
  return {
    school,
    student,
    rows,
    average,
    rank,
    classSize,
    classStats,
    domainBilans,
    absencesSummary: formatAbsenceSummary(absences),
    mention,
    decision,
    distinction: [mention, decision].filter(Boolean).join(' — ') || '',
    term,
    periodLabel,
    homeroomTeacherName: homeroomTeacherName || school?.homeroomTeacherName || '',
    repeatYear,
    statut: publicTypeLabel(school?.publicType),
    schoolYear: formatSchoolYearLabel(student?.class?.schoolYear || school?.currentSchoolYear),
    termAverageLabel: termAverageLabel(term),
    formatGrade: formatGradeCiOrDash,
  };
}

module.exports = {
  classifySubjectDomain,
  computeDomainBilans,
  publicTypeLabel,
  formatRepeatLabel,
  formatSchoolYearLabel,
  formatAbsenceSummary,
  termAverageLabel,
  buildMenetViewModel,
};
