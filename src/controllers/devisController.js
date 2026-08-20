const prisma = require('../config/database');
const { formatMoney } = require('../middleware/currency');
const { sendEmail, smtpConfigured } = require('../services/email');
const { buildQuotePdf } = require('../services/quotePdf');
const { COMMERCIAL_PLAN } = require('../config/plans');
const {
  PARENT_CONTRIBUTION,
  TARIFICATION_CYCLES,
  preselectedCycleFromQuery,
  tarificationForCycle,
} = require('../config/tarification');
const { ensureCsrfToken, requireCsrf } = require('../utils/csrf');
const { parseQuoteBody, quoteSummary } = require('../utils/quoteAnswers');
const { MARKETPLACE_OFFER_OPTIONS } = require('../config/marketplaceOffers');

const CUID_RE = /^c[a-z0-9]{20,32}$/i;

function isQuoteId(id) {
  return typeof id === 'string' && CUID_RE.test(id);
}

function renderForm(req, res, extra = {}) {
  const csrfToken = ensureCsrfToken(req, res);
  const preselectedCycle = extra.preselectedCycle
    ?? preselectedCycleFromQuery(req.query)
    ?? null;
  const defaultValues = preselectedCycle
    ? { ...(extra.values || {}), cycleType: preselectedCycle }
    : (extra.values || {});
  const isConventionRequest = preselectedCycle === 'LYCEE' || req.query.convention === 'lycee';
  return res.render('devis', {
    user: null,
    title: isConventionRequest ? 'Demande de convention' : 'Devis EduConnect',
    homeCss: true,
    devisCss: true,
    csrfToken,
    error: extra.error || null,
    values: defaultValues,
    preselectedCycle,
    isConventionRequest,
    tarificationCycles: TARIFICATION_CYCLES,
    parentContribution: PARENT_CONTRIBUTION,
    commercialPlan: COMMERCIAL_PLAN,
    marketplaceOffers: MARKETPLACE_OFFER_OPTIONS.filter((opt) => opt.value !== 'NONE'),
    formatMoney,
  });
}

function viewModel(quote, extra = {}) {
  const answers = quote.answers || {};
  const summary = quoteSummary(answers);
  const cycle = tarificationForCycle(answers.cycleType);
  const conventionOnly = summary.conventionOnly;
  const proAmount = conventionOnly ? 0 : (quote.amount ?? summary.amount ?? 0);
  const marketplaceAmount = quote.marketplaceAmount ?? summary.marketplaceAmount ?? 0;
  const totalAmount = proAmount + marketplaceAmount;
  return {
    user: null,
    title: conventionOnly ? 'Demande de convention' : 'Votre devis EduConnect',
    homeCss: true,
    devisCss: true,
    quote,
    answers,
    summary,
    cycle,
    parentContribution: PARENT_CONTRIBUTION,
    commercialPlan: COMMERCIAL_PLAN,
    conventionOnly,
    amountLabel: conventionOnly ? null : formatMoney(proAmount),
    marketplaceAmountLabel: formatMoney(marketplaceAmount),
    totalAmountLabel: formatMoney(totalAmount),
    formatMoney,
    csrfToken: extra.csrfToken,
    activationMessage: extra.activationMessage || null,
    activationOk: extra.activationOk || false,
  };
}

async function form(req, res) {
  return renderForm(req, res);
}

async function create(req, res, next) {
  try {
    const parsed = parseQuoteBody(req.body);
    if (!parsed.ok) {
      return renderForm(req, res, {
        error: parsed.errors.join(' '),
        values: req.body,
      });
    }

    const quote = await prisma.quoteRequest.create({
      data: {
        status: 'pending',
        schoolName: parsed.schoolName,
        city: parsed.city,
        answers: parsed.answers,
        amount: parsed.amount,
        marketplaceAmount: parsed.marketplaceAmount,
        contactName: parsed.contactName,
        contactEmail: parsed.contactEmail,
        contactPhone: parsed.contactPhone,
      },
    });

    return res.redirect(`/devis/${quote.id}`);
  } catch (err) {
    return next(err);
  }
}

async function findQuote(id) {
  if (!isQuoteId(id)) return null;
  return prisma.quoteRequest.findUnique({ where: { id } });
}

async function show(req, res, next) {
  try {
    const quote = await findQuote(req.params.id);
    if (!quote) {
      return res.status(404).render('error', { message: 'Devis introuvable', user: null });
    }
    const csrfToken = ensureCsrfToken(req, res);
    return res.render('devis-result', viewModel(quote, { csrfToken }));
  } catch (err) {
    return next(err);
  }
}

async function pdf(req, res, next) {
  try {
    const quote = await findQuote(req.params.id);
    if (!quote) {
      return res.status(404).render('error', { message: 'Devis introuvable', user: null });
    }
    const buffer = await buildQuotePdf(quote);
    const slug = String(quote.schoolName || 'ecole').replace(/[^\w\-]+/g, '-').slice(0, 40);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="devis-educonnect-pro-${slug}.pdf"`);
    return res.status(200).send(buffer);
  } catch (err) {
    return next(err);
  }
}

async function activate(req, res, next) {
  try {
    const quote = await findQuote(req.params.id);
    if (!quote) {
      return res.status(404).render('error', { message: 'Devis introuvable', user: null });
    }

    const updated = await prisma.quoteRequest.update({
      where: { id: quote.id },
      data: {
        status: 'activation_requested',
        activationRequestedAt: quote.activationRequestedAt || new Date(),
      },
    });

    let mailed = false;
    if (smtpConfigured()) {
      const answers = updated.answers || {};
      const cycleLine = answers.cycleLabel
        ? `Cycle : ${answers.cycleLabel}${answers.conventionOnly ? ' (convention)' : ''}`
        : 'Cycle : —';
      const amountLine = answers.conventionOnly
        ? 'Tarif établissement : sur convention (lycée public)'
        : `Tarif établissement : ${formatMoney(updated.amount)} / an`;
      const marketplaceLine = updated.marketplaceAmount
        ? `Visibilité web : ${formatMoney(updated.marketplaceAmount)} / an (${answers.marketplace?.label || 'portail public'})`
        : 'Visibilité web : non';
      const totalLine = answers.conventionOnly
        ? `Total devis : ${updated.marketplaceAmount ? formatMoney(updated.marketplaceAmount) + ' / an (visibilité web uniquement)' : 'convention — pas de tarif public'}`
        : `Total devis : ${formatMoney((updated.amount || 0) + (updated.marketplaceAmount || 0))} / an`;
      const result = await sendEmail('contact@educonnect.ci', {
        subject: `${answers.conventionOnly ? 'Convention lycée' : 'Activation'} — ${updated.schoolName}`,
        text: [
          answers.conventionOnly
            ? 'Demande de convention EduConnect (lycée public)'
            : 'Demande d\'activation EduConnect',
          `Établissement : ${updated.schoolName} (${updated.city})`,
          cycleLine,
          amountLine,
          marketplaceLine,
          totalLine,
          `Contribution parentale : ${formatMoney(PARENT_CONTRIBUTION.amount)} / parent / an`,
          `Référence : ${updated.id}`,
          `Contact : ${updated.contactName || answers.contact?.name || '—'}`,
          `Email : ${updated.contactEmail || answers.contact?.email || '—'}`,
          `Téléphone : ${updated.contactPhone || answers.contact?.phone || '—'}`,
          `Lien : ${(process.env.APP_URL || 'https://educonnect-ci.com').replace(/\/$/, '')}/devis/${updated.id}`,
        ].join('\n'),
      });
      mailed = !!result?.ok;
    }

    const csrfToken = ensureCsrfToken(req, res);
    const activationMessage = mailed
      ? 'Demande envoyée. Nous vous contactons pour activer EduConnect Pro.'
      : 'Demande enregistrée, nous vous contactons.';

    return res.render('devis-result', viewModel(updated, {
      csrfToken,
      activationMessage,
      activationOk: true,
    }));
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  form,
  create,
  show,
  pdf,
  activate,
  requireCsrf,
  isQuoteId,
};
