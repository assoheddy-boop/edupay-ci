/**
 * Grille tarifaire publique EduConnect (alignée sur /tarifs).
 * Primaire et collège : tarif annuel établissement.
 * Lycée public : convention uniquement — pas de prix public.
 */

const { formatMoney } = require('../middleware/currency');

const PARENT_CONTRIBUTION = {
  amount: 2500,
  period: 'FCFA / parent / an',
  label: 'Contribution parentale',
  description:
    'Finance les services utiles aux familles : bulletins, notes, absences, notifications et espace parent sécurisé.',
};

const TARIFICATION_CYCLES = [
  {
    value: 'PRIMAIRE',
    label: 'Primaire',
    amount: 50000,
    period: 'FCFA / an',
    hint: 'CP à CM2 — tarif annuel établissement.',
  },
  {
    value: 'COLLEGE',
    label: 'Collège',
    amount: 80000,
    period: 'FCFA / an',
    hint: '6e à 3e — tarif annuel établissement.',
  },
  {
    value: 'LYCEE',
    label: 'Lycée',
    amount: null,
    conventionOnly: true,
    period: null,
    hint: '2nde à Tle — accès sur convention signée (lycées publics).',
    conventionMessage:
      'Pour les lycées publics, l\'accès à EduConnect se fait uniquement par convention signée avec l\'établissement. Les directions sont priées de faire une demande officielle de convention.',
  },
];

const CYCLE_BY_VALUE = Object.fromEntries(
  TARIFICATION_CYCLES.map((c) => [c.value, c]),
);

const VALID_CYCLE_VALUES = TARIFICATION_CYCLES.map((c) => c.value);

function tarificationForCycle(raw) {
  const upper = String(raw || '').trim().toUpperCase();
  return CYCLE_BY_VALUE[upper] || null;
}

function quoteAmountForCycle(raw) {
  const cycle = tarificationForCycle(raw);
  if (!cycle || cycle.conventionOnly) return 0;
  return cycle.amount;
}

function formatCycleAmount(cycle) {
  if (!cycle || cycle.conventionOnly || cycle.amount == null) return null;
  return formatMoney(cycle.amount);
}

function preselectedCycleFromQuery(query = {}) {
  if (query.convention === 'lycee') return 'LYCEE';
  const fromCycle = String(query.cycle || '').trim().toUpperCase();
  if (VALID_CYCLE_VALUES.includes(fromCycle)) return fromCycle;
  return null;
}

module.exports = {
  PARENT_CONTRIBUTION,
  TARIFICATION_CYCLES,
  CYCLE_BY_VALUE,
  VALID_CYCLE_VALUES,
  tarificationForCycle,
  quoteAmountForCycle,
  formatCycleAmount,
  preselectedCycleFromQuery,
};
