const prisma = require('../config/database');
const { formatMoney } = require('../middleware/currency');
const { sendEmail, smtpConfigured } = require('../services/email');
const { buildQuotePdf } = require('../services/quotePdf');
const { COMMERCIAL_PLAN } = require('../config/plans');
const { ensureCsrfToken, requireCsrf } = require('../utils/csrf');
const { parseQuoteBody, quoteSummary } = require('../utils/quoteAnswers');

const CUID_RE = /^c[a-z0-9]{20,32}$/i;

function isQuoteId(id) {
  return typeof id === 'string' && CUID_RE.test(id);
}

function renderForm(req, res, extra = {}) {
  const csrfToken = ensureCsrfToken(req, res);
  return res.render('devis', {
    user: null,
    title: 'Devis Pro',
    homeCss: true,
    devisCss: true,
    csrfToken,
    error: extra.error || null,
    values: extra.values || {},
    commercialPlan: COMMERCIAL_PLAN,
    formatMoney,
  });
}

function viewModel(quote, extra = {}) {
  const answers = quote.answers || {};
  return {
    user: null,
    title: 'Votre devis Pro',
    homeCss: true,
    devisCss: true,
    quote,
    answers,
    summary: quoteSummary(answers),
    commercialPlan: COMMERCIAL_PLAN,
    amountLabel: formatMoney(quote.amount || COMMERCIAL_PLAN.amount),
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
        amount: COMMERCIAL_PLAN.amount,
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
      const result = await sendEmail('contact@educonnect.ci', {
        subject: `Activation Pro — ${updated.schoolName}`,
        text: [
          'Demande d\'activation EduConnect Pro',
          `Établissement : ${updated.schoolName} (${updated.city})`,
          `Montant : ${formatMoney(updated.amount)} / an`,
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
