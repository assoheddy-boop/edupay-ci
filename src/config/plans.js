const { MODULES } = require('./modules');

const PLAN_IDS = ['essentiel', 'premium', 'pro', 'groupe'];

const PLANS = {
  essentiel: {
    id: 'essentiel',
    name: 'Essentiel',
    tagline: 'Démarrer sans frais',
    price: 0,
    priceLabel: 'Gratuit',
    period: 'pour toujours',
    highlight: false,
    cta: 'Créer mon école',
    ctaHref: '/auth/register?role=SCHOOL_ADMIN&plan=essentiel',
    limits: 'Jusqu\'à 150 élèves · 1 campus',
    modules: ['payments', 'grades', 'absences', 'homeworks', 'chat', 'bulletins'],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    tagline: 'Vie scolaire complète',
    price: 15000,
    priceLabel: '15 000',
    period: 'FCFA / mois',
    highlight: true,
    badge: 'Populaire',
    cta: 'Choisir Premium',
    ctaHref: '/auth/register?role=SCHOOL_ADMIN&plan=premium',
    limits: 'Élèves illimités · 1 campus',
    modules: [
      'payments', 'grades', 'absences', 'homeworks', 'chat', 'bulletins',
      'transport', 'canteen', 'behavior', 'health', 'pickup', 'activities',
      'lost_items', 'stats', 'redoublementAnalysis',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'Pilotage & équipe',
    price: 35000,
    priceLabel: '35 000',
    period: 'FCFA / mois',
    highlight: false,
    cta: 'Choisir Pro',
    ctaHref: '/auth/register?role=SCHOOL_ADMIN&plan=pro',
    limits: 'Élèves illimités · 1 campus',
    modules: Object.keys(MODULES).filter((k) => k !== 'multi_campus'),
  },
  groupe: {
    id: 'groupe',
    name: 'Groupe scolaire',
    tagline: 'Multi-campus & direction groupe',
    price: null,
    priceLabel: 'Sur devis',
    period: 'à partir de 50 000 FCFA / mois',
    highlight: false,
    isGroup: true,
    cta: 'Demander une démo',
    ctaHref: 'mailto:contact@edupay.ci?subject=Groupe%20scolaire%20EduPay',
    limits: '2 campus et plus · tarif dégressif',
    modules: Object.keys(MODULES),
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
  const moduleList = Object.entries(MODULES).map(([key, mod]) => ({
    key,
    label: mod.label,
    description: mod.description,
    core: !!mod.core,
  }));

  const plans = PLAN_IDS.map((id) => {
    const plan = PLANS[id];
    const moduleSet = new Set(plan.modules);
    return {
      ...plan,
      moduleFlags: moduleList.map((m) => ({
        ...m,
        included: moduleSet.has(m.key),
      })),
    };
  });

  return { plans, moduleList };
}

const PLAN_NAME_BY_ID = Object.fromEntries(
  PLAN_IDS.map((id) => [id, PLANS[id].name]),
);

function planSeedPrice(plan) {
  return plan.price == null ? 50000 : plan.price;
}

module.exports = { PLANS, PLAN_IDS, PLAN_NAME_BY_ID, getPlansForLanding, planSeedPrice };
