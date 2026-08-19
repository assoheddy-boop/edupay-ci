const SERIES = ['A', 'C', 'D', 'AUTRE'];

const SERIES_OPTIONS = [
  { value: 'A', label: 'Série A' },
  { value: 'C', label: 'Série C' },
  { value: 'D', label: 'Série D' },
  { value: 'AUTRE', label: 'Autre' },
];

function parseSeries(value) {
  if (value == null || String(value).trim() === '') return null;
  const raw = String(value).trim().toUpperCase();
  if (raw === 'AUTRE' || raw === 'AUTRES' || raw === 'OTHER') return 'AUTRE';
  return SERIES.includes(raw) ? raw : null;
}

function seriesLabel(value) {
  const s = parseSeries(value);
  if (!s) return null;
  if (s === 'AUTRE') return 'Autre';
  return `Série ${s}`;
}

function effectiveSeries(student, klass) {
  return parseSeries(student?.series)
    || parseSeries(klass?.series)
    || parseSeries(student?.class?.series)
    || null;
}

function matchesSeriesFilter(student, klass, filter) {
  const wanted = parseSeries(filter);
  if (!wanted) return true;
  return effectiveSeries(student, klass) === wanted;
}

function classHasSeries(klass, students = []) {
  if (parseSeries(klass?.series)) return true;
  return (students || []).some((s) => parseSeries(s.series));
}

module.exports = {
  SERIES,
  SERIES_OPTIONS,
  parseSeries,
  seriesLabel,
  effectiveSeries,
  matchesSeriesFilter,
  classHasSeries,
};
