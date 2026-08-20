/**
 * Catalogue officiel des rubriques de paie CI (CNPS + fiscalité).
 * Les écoles peuvent surcharger les taux via SchoolPayRubrique.
 */
const DEFAULT_PAY_RUBRIQUES = Object.freeze([
  { code: '100', label: 'Salaire de base', block: 1, category: 'GAIN', sortOrder: 1 },
  { code: '110', label: 'Sursalaire', block: 1, category: 'GAIN', sortOrder: 2 },
  { code: '210', label: 'Prime de responsabilité', block: 1, category: 'GAIN', sortOrder: 3 },
  { code: '211', label: "Prime d'ancienneté", block: 1, category: 'GAIN', sortOrder: 4, defaultRate: 4 },
  { code: '212', label: 'Allocation congés', block: 1, category: 'GAIN', sortOrder: 5 },
  { code: '213', label: 'Gratification', block: 1, category: 'GAIN', sortOrder: 6 },
  { code: '810', label: 'Régime Général (CNPS)', block: 2, category: 'DEDUCTION', sortOrder: 10, defaultRate: 6.3 },
  { code: '820', label: 'Impôt sur salaire (IS)', block: 2, category: 'DEDUCTION', sortOrder: 11, defaultRate: 1.2 },
  { code: '835', label: 'Contribution Nationale (CN)', block: 2, category: 'DEDUCTION', sortOrder: 12 },
  { code: '840', label: 'Impôt Général sur le Revenu (IGR)', block: 2, category: 'DEDUCTION', sortOrder: 13 },
  { code: '204', label: 'Indemnité de transport', block: 3, category: 'GAIN', sortOrder: 20, defaultFixed: 30000 },
  { code: '453', label: 'Avances', block: 3, category: 'DEDUCTION', sortOrder: 21 },
  { code: '510', label: 'Assurance', block: 3, category: 'DEDUCTION', sortOrder: 22 },
  { code: '512', label: 'Prélèvement divers (CMU)', block: 3, category: 'DEDUCTION', sortOrder: 23, defaultFixed: 2000 },
]);

const PAYMENT_METHODS = Object.freeze({
  ESPECE: 'Espèce',
  CHEQUE: 'Chèque',
  VIREMENT: 'Virement bancaire',
});

function getDefaultRubrique(code) {
  return DEFAULT_PAY_RUBRIQUES.find((r) => r.code === code) || null;
}

function mergeSchoolRubriques(overrides = []) {
  const byCode = new Map(overrides.map((o) => [o.code, o]));
  return DEFAULT_PAY_RUBRIQUES.map((def) => {
    const school = byCode.get(def.code);
    return {
      ...def,
      label: school?.label || def.label,
      rate: school?.rate ?? def.defaultRate ?? null,
      fixedAmount: school?.fixedAmount ?? def.defaultFixed ?? null,
      enabled: school?.enabled ?? true,
    };
  }).filter((r) => r.enabled);
}

module.exports = {
  DEFAULT_PAY_RUBRIQUES,
  PAYMENT_METHODS,
  getDefaultRubrique,
  mergeSchoolRubriques,
};
