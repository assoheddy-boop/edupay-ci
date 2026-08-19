/** Trimestres structurés collège CI. Les anciennes chaînes libres sont mappées à la lecture. */

const TERMS = [
  { value: 'T1', label: 'Trimestre 1' },
  { value: 'T2', label: 'Trimestre 2' },
  { value: 'T3', label: 'Trimestre 3' },
];

const OTHER_TERM = { value: 'AUTRE', label: 'Autre' };
const ANNUAL_TERM = { value: 'ANNUELLE', label: 'Annuelle' };

const ENTRY_TERMS = [...TERMS, OTHER_TERM];
const BULLETIN_TERMS = [...TERMS, ANNUAL_TERM];

const TERM_LABELS = {
  T1: 'Trimestre 1',
  T2: 'Trimestre 2',
  T3: 'Trimestre 3',
  ANNUELLE: 'Annuelle',
  AUTRE: 'Autre',
};

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeTerm(period) {
  const raw = String(period || '').trim();
  if (!raw) return 'AUTRE';
  const upper = raw.toUpperCase();
  if (upper === 'T1' || upper === 'T2' || upper === 'T3') return upper;
  if (upper === 'ANNUELLE' || upper === 'ANNUEL') return 'ANNUELLE';
  if (upper === 'AUTRE') return 'AUTRE';

  const f = fold(raw);
  if (!f) return 'AUTRE';

  if (
    /^(annuelle|annuel|annee|annee scolaire|moyenne annuelle)$/.test(f)
    || f.includes('annuel')
  ) {
    return 'ANNUELLE';
  }

  if (
    /^(t1|trimestre 1|trim 1|1er trimestre|premier trimestre|1 trimestre|periode 1|1ere periode)$/.test(f)
    || /\b(trimestre|trim|periode)\s*1\b/.test(f)
    || /\b1\s*(er|ere)?\s*(trimestre|trim|periode)\b/.test(f)
  ) {
    return 'T1';
  }

  if (
    /^(t2|trimestre 2|trim 2|2e trimestre|2eme trimestre|deuxieme trimestre|2 trimestre|periode 2)$/.test(f)
    || /\b(trimestre|trim|periode)\s*2\b/.test(f)
    || /\b2\s*(e|eme)?\s*(trimestre|trim|periode)\b/.test(f)
  ) {
    return 'T2';
  }

  if (
    /^(t3|trimestre 3|trim 3|3e trimestre|3eme trimestre|troisieme trimestre|3 trimestre|periode 3)$/.test(f)
    || /\b(trimestre|trim|periode)\s*3\b/.test(f)
    || /\b3\s*(e|eme)?\s*(trimestre|trim|periode)\b/.test(f)
  ) {
    return 'T3';
  }

  return 'AUTRE';
}

function formatTermLabel(period) {
  const term = normalizeTerm(period);
  if (term !== 'AUTRE') return TERM_LABELS[term];
  const raw = String(period || '').trim();
  return raw || TERM_LABELS.AUTRE;
}

function canonicalPeriod(period) {
  const term = normalizeTerm(period);
  if (term === 'AUTRE') {
    const raw = String(period || '').trim();
    return raw || 'AUTRE';
  }
  return term;
}

function gradeTerm(grade) {
  return normalizeTerm(grade?.term || grade?.period);
}

function filterGradesForBulletin(grades, periodInput) {
  const list = Array.isArray(grades) ? grades : [];
  const term = normalizeTerm(periodInput);

  if (term === 'ANNUELLE') {
    return list.filter((g) => ['T1', 'T2', 'T3'].includes(gradeTerm(g)));
  }

  if (term !== 'AUTRE') {
    return list.filter((g) => gradeTerm(g) === term);
  }

  const raw = String(periodInput || '').trim();
  const exact = list.filter((g) => String(g.period || '').trim() === raw);
  if (raw && exact.length) return exact;
  return list.filter((g) => gradeTerm(g) === 'AUTRE');
}

module.exports = {
  TERMS,
  ENTRY_TERMS,
  BULLETIN_TERMS,
  ANNUAL_TERM,
  OTHER_TERM,
  TERM_LABELS,
  normalizeTerm,
  formatTermLabel,
  canonicalPeriod,
  gradeTerm,
  filterGradesForBulletin,
};
