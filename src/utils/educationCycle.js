/**
 * Cycle d’enseignement d’une école (primaire / collège / lycée / mixte).
 * Défaut COLLEGE : les menus collège restent visibles (IGEST, écoles existantes).
 */

const EDUCATION_CYCLE = {
  PRIMAIRE: 'PRIMAIRE',
  COLLEGE: 'COLLEGE',
  LYCEE: 'LYCEE',
  MIXTE: 'MIXTE',
};

const DEFAULT_CYCLE = EDUCATION_CYCLE.COLLEGE;

const EDUCATION_CYCLE_OPTIONS = [
  {
    value: EDUCATION_CYCLE.PRIMAIRE,
    label: 'Primaire',
    hint: 'CP–CM2. Pas de séries lycée ni d’examen national (BEPC / BAC).',
  },
  {
    value: EDUCATION_CYCLE.COLLEGE,
    label: 'Collège',
    hint: '6e–3e. Délibérations, palmarès, convocations blanc et national.',
  },
  {
    value: EDUCATION_CYCLE.LYCEE,
    label: 'Lycée',
    hint: '2nde–Tle. Même pile examens que le collège, plus les séries A / C / D.',
  },
  {
    value: EDUCATION_CYCLE.MIXTE,
    label: 'Mixte (primaire + secondaire)',
    hint: 'Primaire et collège, ou primaire + collège + lycée. Menus séparés.',
  },
];

const CYCLE_LABELS = Object.fromEntries(
  EDUCATION_CYCLE_OPTIONS.map((opt) => [opt.value, opt.label]),
);

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseEducationCycle(raw) {
  const upper = String(raw || '').trim().toUpperCase();
  if (EDUCATION_CYCLE[upper]) return upper;

  const f = fold(raw);
  if (!f) return DEFAULT_CYCLE;
  if (f === 'mixte' || (f.includes('primaire') && (f.includes('college') || f.includes('lycee') || f.includes('secondaire')))) {
    return EDUCATION_CYCLE.MIXTE;
  }
  if (f === 'primaire' || f === 'primary' || f.startsWith('prim')) return EDUCATION_CYCLE.PRIMAIRE;
  if (f === 'college' || f === 'college unique' || f === 'secondaire 1er cycle') return EDUCATION_CYCLE.COLLEGE;
  if (f === 'lycee' || f === 'lycee unique' || f === 'secondaire 2nd cycle') return EDUCATION_CYCLE.LYCEE;
  return DEFAULT_CYCLE;
}

function cycleFlags(raw) {
  const value = parseEducationCycle(raw);
  const isPrimaire = value === EDUCATION_CYCLE.PRIMAIRE;
  const isCollege = value === EDUCATION_CYCLE.COLLEGE;
  const isLycee = value === EDUCATION_CYCLE.LYCEE;
  const isMixte = value === EDUCATION_CYCLE.MIXTE;
  const hasPrimaire = isPrimaire || isMixte;
  const hasSecondaire = isCollege || isLycee || isMixte;
  const hasLyceeSeries = isLycee || isMixte;
  const hasNationalExam = hasSecondaire;
  const hasPalmares = hasSecondaire;
  const hasNationalMatricule = hasSecondaire;

  return {
    value,
    label: CYCLE_LABELS[value],
    isPrimaire,
    isCollege,
    isLycee,
    isMixte,
    hasPrimaire,
    hasSecondaire,
    hasLyceeSeries,
    hasNationalExam,
    hasPalmares,
    hasNationalMatricule,
    deliberationsLabel: hasPrimaire && !hasSecondaire ? 'Évaluations' : 'Délibérations',
    teacherCouncilLabel: hasPrimaire && !hasSecondaire ? 'Évaluations' : 'Conseil de classe',
    convocationsLabel: hasNationalExam
      ? 'Convocations (blanc + national)'
      : 'Convocations (blanc)',
  };
}

function examTypesForCycle(raw) {
  const types = [
    { value: 'BLANC', label: 'Examen blanc' },
    { value: 'NATIONAL', label: 'Examen national' },
  ];
  return cycleFlags(raw).hasNationalExam ? types : types.filter((t) => t.value === 'BLANC');
}

function allowsNationalExam(raw) {
  return cycleFlags(raw).hasNationalExam;
}

function schoolFromUser(user) {
  return user?.school || user?.teacher?.school || null;
}

module.exports = {
  EDUCATION_CYCLE,
  DEFAULT_CYCLE,
  EDUCATION_CYCLE_OPTIONS,
  CYCLE_LABELS,
  parseEducationCycle,
  cycleFlags,
  examTypesForCycle,
  allowsNationalExam,
  schoolFromUser,
};
