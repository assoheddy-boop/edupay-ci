function ordinalFr(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 1) return '';
  return v === 1 ? '1er' : `${v}e`;
}

function genderGroupLabel(gender) {
  if (gender === 'F') return 'filles';
  if (gender === 'M') return 'garçons';
  return null;
}

function genderShortLabel(gender) {
  if (gender === 'F') return 'fille';
  if (gender === 'M') return 'garçon';
  return null;
}

function avgSortKey(avg) {
  if (avg == null || !Number.isFinite(Number(avg))) return Number.NEGATIVE_INFINITY;
  return Number(avg);
}

function sortByAverage(entries) {
  return [...(entries || [])].sort((a, b) => {
    const diff = avgSortKey(b.avg) - avgSortKey(a.avg);
    if (diff !== 0) return diff;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function normalizeGender(value) {
  const g = String(value || '').trim().toUpperCase();
  return g === 'M' || g === 'F' ? g : null;
}

/**
 * Rang dans la liste (classe ou série filtrée) + rang parmi les filles / garçons.
 */
function computeClassement(entries, studentId) {
  const list = sortByAverage(entries);
  const idx = list.findIndex((e) => e.id === studentId);
  const target = idx >= 0 ? list[idx] : null;
  const gender = normalizeGender(target?.gender);
  let genderRank = null;
  let genderSize = 0;
  if (gender) {
    const same = list.filter((e) => normalizeGender(e.gender) === gender);
    genderSize = same.length;
    const gIdx = same.findIndex((e) => e.id === studentId);
    genderRank = gIdx >= 0 ? gIdx + 1 : null;
  }
  return {
    rank: idx >= 0 ? idx + 1 : null,
    classSize: list.length,
    gender,
    genderRank,
    genderSize,
    genderGroup: genderGroupLabel(gender),
    genderShort: genderShortLabel(gender),
  };
}

function attachClassement(rows) {
  const entries = (rows || []).map((row) => ({
    id: row.studentId || row.id,
    avg: row.average ?? row.avg,
    gender: row.gender,
  }));
  return (rows || []).map((row) => {
    const id = row.studentId || row.id;
    return { ...row, ...computeClassement(entries, id) };
  });
}

function formatClassRank({ rank, classSize } = {}) {
  if (!rank || !classSize) return null;
  return `${ordinalFr(rank)} / ${classSize}`;
}

function formatGenderRank({ genderRank, genderSize, genderGroup } = {}) {
  if (!genderRank || !genderSize || !genderGroup) return null;
  return `${ordinalFr(genderRank)} / ${genderSize}`;
}

function formatRankCompact(row = {}) {
  const classLine = formatClassRank(row);
  const genderLine = formatGenderRank(row);
  if (!classLine) return '—';
  if (!genderLine || !row.genderShort) return classLine;
  return `${classLine} · ${ordinalFr(row.genderRank)} ${row.genderShort}`;
}

module.exports = {
  ordinalFr,
  genderGroupLabel,
  computeClassement,
  attachClassement,
  formatClassRank,
  formatGenderRank,
  formatRankCompact,
  sortByAverage,
};
