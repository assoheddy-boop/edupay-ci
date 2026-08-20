const { COMMERCIAL_PLAN } = require('../config/plans');
const {
  MARKETPLACE_OFFER_OPTIONS,
  marketplaceOfferForTier,
  parseQuoteMarketplaceTier,
} = require('../config/marketplaceOffers');

const CORE_MODULES = [
  'Paiements Wave / Orange Money',
  'Notes & bulletins',
  'Absences et retards',
  'Devoirs & contrôles',
  'Messages école ↔ familles',
];

const PRO_INCLUDED = [
  'Support prioritaire',
  'Formation des équipes',
  'SMS officiel',
  'Comptabilité',
  'Ressources humaines',
  'Multi-école / groupe scolaire',
];

function trimStr(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, max);
}

function parseCount(value, { min = 1, max = 100000 } = {}) {
  const n = Number.parseInt(String(value ?? '').replace(/\s/g, ''), 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function isChecked(value) {
  if (Array.isArray(value)) return value.some(isChecked);
  const raw = String(value || '').toLowerCase();
  return raw === 'on' || raw === '1' || raw === 'true' || raw === 'oui' || raw === 'yes';
}

function parseQuoteBody(body = {}) {
  const schoolName = trimStr(body.schoolName, 160);
  const city = trimStr(body.city, 80);
  const isGroup = body.isGroup === 'oui' || body.isGroup === 'yes' || body.isGroup === '1';
  const groupName = isGroup ? trimStr(body.groupName, 160) : '';
  const students = parseCount(body.students, { min: 1, max: 100000 });
  const teachers = parseCount(body.teachers, { min: 1, max: 10000 });
  const classes = parseCount(body.classes, { min: 1, max: 5000 });
  const contactName = trimStr(body.contactName, 120);
  const contactEmail = trimStr(body.contactEmail, 160);
  const contactPhone = trimStr(body.contactPhone, 40);

  const errors = [];
  if (schoolName.length < 2) errors.push('Indiquez le nom de l\'établissement.');
  if (city.length < 2) errors.push('Indiquez la ville.');
  if (students == null) errors.push('Indiquez le nombre d\'élèves.');
  if (teachers == null) errors.push('Indiquez le nombre d\'enseignants.');
  if (classes == null) errors.push('Indiquez le nombre de classes.');
  if (isGroup && groupName.length < 2) errors.push('Indiquez le nom du groupe scolaire.');
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    errors.push('L\'email de contact n\'est pas valide.');
  }

  const life = {
    canteen: isChecked(body.lifeCanteen),
    transport: isChecked(body.lifeTransport),
    activities: isChecked(body.lifeActivities),
    health: isChecked(body.lifeHealth),
  };
  const admin = {
    accounting: isChecked(body.adminAccounting),
    hr: isChecked(body.adminHr),
    multiSchool: isChecked(body.adminMulti) || isGroup,
  };
  const comm = {
    smsOfficial: isChecked(body.commSms),
    pushEmail: isChecked(body.commNotify),
  };

  const history = {
    year1: parseCount(body.historyYear1, { min: 0, max: 100000 }),
    year2: parseCount(body.historyYear2, { min: 0, max: 100000 }),
    year3: parseCount(body.historyYear3, { min: 0, max: 100000 }),
    digitalBudget: trimStr(body.digitalBudget, 80),
  };

  const marketplaceTier = parseQuoteMarketplaceTier(body.marketplaceTier);
  const marketplaceOffer = marketplaceOfferForTier(marketplaceTier);
  const marketplace = {
    selected: marketplaceTier !== 'NONE',
    tier: marketplaceTier,
    label: marketplaceOffer.label,
    amount: marketplaceOffer.amount,
    hint: marketplaceOffer.hint,
  };

  const answers = {
    schoolName,
    city,
    isGroup,
    groupName,
    students,
    teachers,
    classes,
    life,
    admin,
    comm,
    history,
    marketplace,
    contact: { name: contactName, email: contactEmail, phone: contactPhone },
  };

  const proAmount = COMMERCIAL_PLAN.amount;
  const marketplaceAmount = marketplace.amount;

  return {
    ok: errors.length === 0,
    errors,
    answers,
    schoolName,
    city,
    contactName: contactName || null,
    contactEmail: contactEmail || null,
    contactPhone: contactPhone || null,
    amount: proAmount,
    marketplaceAmount,
    totalAmount: proAmount + marketplaceAmount,
  };
}

function selectedModules(answers) {
  const extra = [];
  if (answers.life?.canteen) extra.push('Cantine');
  if (answers.life?.transport) extra.push('Transport');
  if (answers.life?.activities) extra.push('Activités extrascolaires');
  if (answers.life?.health) extra.push('Santé scolaire');
  if (answers.admin?.accounting) extra.push('Comptabilité');
  if (answers.admin?.hr) extra.push('Ressources humaines');
  if (answers.admin?.multiSchool) extra.push('Multi-école / groupe');
  if (answers.comm?.smsOfficial) extra.push('SMS officiel');
  if (answers.comm?.pushEmail) extra.push('Notifications push et e-mail');
  return extra;
}

function quoteSummary(answers) {
  const selected = selectedModules(answers);
  const marketplace = answers.marketplace || { selected: false, tier: 'NONE', amount: 0 };
  const proAmount = COMMERCIAL_PLAN.amount;
  const marketplaceAmount = marketplace.amount || 0;
  return {
    core: CORE_MODULES,
    selected,
    included: PRO_INCLUDED,
    planName: COMMERCIAL_PLAN.name,
    amount: proAmount,
    marketplace,
    marketplaceAmount,
    totalAmount: proAmount + marketplaceAmount,
    tagline: COMMERCIAL_PLAN.tagline,
  };
}

module.exports = {
  CORE_MODULES,
  PRO_INCLUDED,
  MARKETPLACE_OFFER_OPTIONS,
  parseQuoteBody,
  selectedModules,
  quoteSummary,
};
