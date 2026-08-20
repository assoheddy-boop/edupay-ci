const { MODULES } = require('./modules');

const PLAN_IDS = ['essentiel', 'premium', 'pro', 'groupe'];

const COMMERCIAL_PLAN = {
  id: 'pro',
  name: 'Pro',
  amount: 500000,
  period: 'FCFA / an',
  tagline: 'Un seul plan, complet et premium, adapté à votre école',
};

const PLANS = {
  essentiel: {
    id: 'essentiel',
    name: 'Essentiel',
    displayName: 'Pro',
    tagline: 'Démarrer sans frais',
    price: 0,
    displayPrice: COMMERCIAL_PLAN.amount,
    priceLabel: 'Gratuit',
    period: 'pour toujours',
    highlight: false,
    cta: 'Créer mon école',
    ctaHref: '/auth/register?role=SCHOOL_ADMIN&plan=essentiel',
    limits: 'Jusqu\'à 150 élèves · 1 campus',
    modules: ['payments', 'grades', 'absences', 'homeworks', 'chat', 'bulletins', 'sms_official'],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    displayName: 'Pro',
    tagline: 'Vie scolaire complète',
    price: 15000,
    displayPrice: COMMERCIAL_PLAN.amount,
    priceLabel: '15 000',
    period: 'FCFA / mois',
    highlight: false,
    cta: 'Choisir Premium',
    ctaHref: '/auth/register?role=SCHOOL_ADMIN&plan=premium',
    limits: 'Élèves illimités · 1 campus',
    modules: [
      'payments', 'grades', 'absences', 'homeworks', 'chat', 'bulletins',
      'transport', 'canteen', 'behavior', 'health', 'pickup', 'activities',
      'lost_items', 'stats', 'accounting', 'hr', 'multi_campus',
      'redoublementAnalysis', 'sms_official',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    displayName: 'Pro',
    tagline: COMMERCIAL_PLAN.tagline,
    price: COMMERCIAL_PLAN.amount,
    displayPrice: COMMERCIAL_PLAN.amount,
    priceLabel: '500 000',
    period: COMMERCIAL_PLAN.period,
    highlight: true,
    badge: 'Offre unique',
    cta: 'Obtenir un devis',
    ctaHref: '/devis',
    limits: 'Tous les modules · élèves illimités · multi-école',
    modules: Object.keys(MODULES).filter((key) => !MODULES[key].addon),
  },
  groupe: {
    id: 'groupe',
    name: 'Groupe scolaire',
    displayName: 'Pro',
    tagline: 'Multi-campus & direction groupe',
    price: null,
    displayPrice: COMMERCIAL_PLAN.amount,
    priceLabel: 'Sur devis',
    period: 'à partir de 50 000 FCFA / mois',
    highlight: false,
    isGroup: true,
    cta: 'Demander une démo',
    ctaHref: 'mailto:contact@educonnect.ci?subject=Groupe%20scolaire%20EduConnect',
    limits: '2 campus et plus · tarif dégressif',
    modules: Object.keys(MODULES).filter((key) => !MODULES[key].addon),
    perks: [
      'Tableau de bord consolidé (élèves, recettes, absences)',
      'Vue par campus avec modules activables individuellement',
      'Comptabilité & RH centralisés ou par établissement',
      'Facturation unique ou par campus',
      'Accompagnement déploiement & formation équipes',
    ],
  },
};

function getPlansForLanding() {
  const moduleList = Object.entries(MODULES)
    .filter(([, mod]) => !mod.addon)
    .map(([key, mod]) => ({
      key,
      label: mod.label,
      description: mod.description,
      core: !!mod.core,
    }));

  const plan = PLANS.pro;
  const moduleSet = new Set(plan.modules);
  return {
    plans: [{
      ...plan,
      moduleFlags: moduleList.map((m) => ({
        ...m,
        included: moduleSet.has(m.key),
      })),
    }],
    moduleList,
    commercialPlan: COMMERCIAL_PLAN,
  };
}

const PLAN_NAME_BY_ID = Object.fromEntries(
  PLAN_IDS.map((id) => [id, PLANS[id].name]),
);

function planSeedPrice(plan) {
  return plan.price == null ? COMMERCIAL_PLAN.amount : plan.price;
}

function displayPlanName(nameOrSlug) {
  const key = String(nameOrSlug || '').trim().toLowerCase();
  if (!key) return COMMERCIAL_PLAN.name;
  if (['essentiel', 'premium', 'pro', 'groupe', 'standard', 'basic', 'groupe scolaire'].includes(key)) {
    return COMMERCIAL_PLAN.name;
  }
  return COMMERCIAL_PLAN.name;
}

module.exports = {
  PLANS,
  PLAN_IDS,
  PLAN_NAME_BY_ID,
  COMMERCIAL_PLAN,
  getPlansForLanding,
  planSeedPrice,
  displayPlanName,
};
