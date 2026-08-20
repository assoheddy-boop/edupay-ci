const { formatFcfa, buildRenewalPaymentLink } = require('./marketplaceWavePayment');
const { marketplaceOfferForTier } = require('../config/marketplaceOffers');
const { parseMarketplaceTier } = require('./marketplaceAddon');

function formatDateFr(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function marketplaceRenewalEmailText(school, { daysLeft } = {}) {
  const tier = parseMarketplaceTier(school?.marketplaceTier);
  const offer = marketplaceOfferForTier(tier);
  const payment = buildRenewalPaymentLink(school);
  const expiresAt = school?.marketplaceExpiresAt;
  const days = daysLeft != null ? daysLeft : '';
  const lines = [
    `Bonjour,`,
    '',
    `Votre abonnement Marketplace EduConnect pour « ${school?.name || 'votre établissement'} » arrive à échéance${days !== '' ? ` dans ${days} jour(s)` : ''}.`,
    '',
    `Offre actuelle : ${offer.label} (${formatFcfa(payment.amount)} / an)`,
    `Date de fin : ${formatDateFr(expiresAt)}`,
    '',
    'Pour renouveler et conserver votre page publique /e/:slug ainsi que votre visibilité sur /ecoles :',
    '',
    `1. Connectez-vous à EduConnect : ${payment.renewalPageUrl}`,
    '2. Cliquez sur « Payer avec Wave » pour régler en ligne.',
    '',
    `Référence de paiement : ${payment.reference}`,
    '',
    'Après réception du paiement, EduConnect prolonge votre abonnement d’un an. En cas de question : contact@educonnect.ci',
    '',
    '— Équipe EduConnect',
    'https://educonnect-ci.com',
  ];
  return lines.join('\n');
}

function marketplaceRenewalEmailSubject(school) {
  const name = school?.name || 'votre école';
  return `Renouvellement Marketplace — ${name} — échéance proche`;
}

module.exports = {
  formatDateFr,
  marketplaceRenewalEmailText,
  marketplaceRenewalEmailSubject,
};
