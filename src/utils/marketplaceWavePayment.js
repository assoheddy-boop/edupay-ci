const { SITE_ORIGIN } = require('./publicPortal');
const { marketplaceOfferAmount, marketplaceOfferForTier } = require('../config/marketplaceOffers');
const { parseMarketplaceTier } = require('./marketplaceAddon');

function appOrigin() {
  return (process.env.APP_URL || SITE_ORIGIN || 'https://educonnect-ci.com').replace(/\/$/, '');
}

function renewalClientReference(schoolId) {
  const year = new Date().getFullYear();
  const shortId = String(schoolId || '').slice(-8);
  return `MP-${year}-${shortId}`;
}

function formatFcfa(amount) {
  return `${Number(amount || 0).toLocaleString('fr-FR')} FCFA`;
}

function waveMerchantNumber() {
  return String(process.env.EDUCONNECT_WAVE_NUMBER || process.env.WAVE_MERCHANT_NUMBER || '').trim();
}

/**
 * Lien Wave manuel (sans API) : ouvre l’app avec le numéro marchand EduConnect.
 * Référence à indiquer dans le libellé du paiement.
 */
function manualWavePaymentUrl(amount) {
  const phone = waveMerchantNumber().replace(/\D/g, '');
  if (!phone) return null;
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  if (amt > 0) {
    return `https://pay.wave.com/m/${encodeURIComponent(phone)}?amount=${amt}`;
  }
  return `https://pay.wave.com/m/${encodeURIComponent(phone)}`;
}

async function createWaveCheckoutSession({ amount, clientReference, successUrl, errorUrl }) {
  const apiKey = String(process.env.WAVE_API_KEY || '').trim();
  if (!apiKey) {
    return { ok: false, reason: 'no_api_key' };
  }
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  if (amt <= 0) {
    return { ok: false, reason: 'invalid_amount' };
  }
  const origin = appOrigin();
  const body = {
    amount: String(amt),
    currency: 'XOF',
    client_reference: clientReference || `mp-${Date.now()}`,
    success_url: successUrl || `${origin}/school/marketplace-renewal?paid=1`,
    error_url: errorUrl || `${origin}/school/marketplace-renewal?paid=0`,
  };
  try {
    const res = await fetch('https://api.wave.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, reason: data.message || data.code || `http_${res.status}` };
    }
    return {
      ok: true,
      mode: 'checkout',
      sessionId: data.id,
      waveLaunchUrl: data.wave_launch_url,
      amount: amt,
      clientReference: body.client_reference,
    };
  } catch (err) {
    return { ok: false, reason: err?.message || 'fetch_failed' };
  }
}

function buildRenewalPaymentLink(school) {
  const tier = parseMarketplaceTier(school?.marketplaceTier);
  const amount = marketplaceOfferAmount(tier);
  const offer = marketplaceOfferForTier(tier);
  const reference = renewalClientReference(school?.id);
  const origin = appOrigin();
  const renewalPageUrl = `${origin}/school/marketplace-renewal`;
  return {
    tier,
    amount,
    offerLabel: offer.shortLabel || offer.label,
    reference,
    renewalPageUrl,
    payPageUrl: `${renewalPageUrl}/pay`,
  };
}

async function createMarketplaceRenewalCheckout(school) {
  const link = buildRenewalPaymentLink(school);
  const checkout = await createWaveCheckoutSession({
    amount: link.amount,
    clientReference: link.reference,
    successUrl: `${link.renewalPageUrl}?paid=1&ref=${encodeURIComponent(link.reference)}`,
    errorUrl: `${link.renewalPageUrl}?paid=0`,
  });
  if (checkout.ok && checkout.waveLaunchUrl) {
    return { ...link, mode: 'checkout', waveLaunchUrl: checkout.waveLaunchUrl, sessionId: checkout.sessionId };
  }
  const manualUrl = manualWavePaymentUrl(link.amount);
  return {
    ...link,
    mode: manualUrl ? 'manual' : 'contact',
    waveLaunchUrl: manualUrl,
    waveNumber: waveMerchantNumber() || null,
    checkoutError: checkout.reason || null,
  };
}

module.exports = {
  appOrigin,
  renewalClientReference,
  formatFcfa,
  manualWavePaymentUrl,
  createWaveCheckoutSession,
  buildRenewalPaymentLink,
  createMarketplaceRenewalCheckout,
};
