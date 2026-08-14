const { getPrefsCookieOptions, safeBack } = require('../utils/cookies');

const CURRENCY_CODES = ['XOF', 'EUR', 'USD'];
const DEFAULT_CURRENCY = 'XOF';

const EUR_XOF = Number(process.env.CURRENCY_EUR_XOF) || 655.957;
const USD_XOF = Number(process.env.CURRENCY_USD_XOF) || 600;

const CURRENCIES = {
  XOF: {
    code: 'XOF',
    symbol: 'FCFA',
    name: 'Franc CFA',
    locale: 'fr-FR',
    decimals: 0,
    xofPerUnit: 1,
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    locale: 'fr-FR',
    decimals: 2,
    xofPerUnit: EUR_XOF,
  },
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    locale: 'en-US',
    decimals: 2,
    xofPerUnit: USD_XOF,
  },
};

function pickCurrency(value) {
  const code = String(value || '').toUpperCase();
  if (code === 'FCFA') return 'XOF';
  return CURRENCY_CODES.includes(code) ? code : null;
}

function convertFromXof(amountXof, currency) {
  const meta = CURRENCIES[currency] || CURRENCIES.XOF;
  const value = Number(amountXof) || 0;
  return value / meta.xofPerUnit;
}

function formatMoney(amountXof, currency = DEFAULT_CURRENCY) {
  const meta = CURRENCIES[currency] || CURRENCIES.XOF;
  const converted = convertFromXof(amountXof, meta.code);
  const formatted = converted.toLocaleString(meta.locale, {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });
  if (meta.code === 'XOF') return `${formatted} ${meta.symbol}`;
  if (meta.code === 'USD') return `${meta.symbol}${formatted}`;
  return `${formatted} ${meta.symbol}`;
}

function resolveCurrency(req) {
  return pickCurrency(req.query.currency)
    || pickCurrency(req.cookies?.currency)
    || pickCurrency(req.user?.school?.currency)
    || pickCurrency(req.user?.teacher?.school?.currency)
    || DEFAULT_CURRENCY;
}

function applyCurrency(req, res) {
  const currency = resolveCurrency(req);
  req.currency = currency;
  res.locals.currency = currency;
  res.locals.currencies = CURRENCY_CODES;
  res.locals.currencyMeta = CURRENCIES[currency];
  res.locals.formatMoney = (amount) => formatMoney(amount, currency);
}

function currencyMiddleware(req, res, next) {
  applyCurrency(req, res);
  next();
}

function setCurrency(req, res) {
  const currency = pickCurrency(req.params.code) || DEFAULT_CURRENCY;
  res.cookie('currency', currency, getPrefsCookieOptions());
  return res.redirect(safeBack(req));
}

module.exports = {
  currencyMiddleware,
  applyCurrency,
  setCurrency,
  formatMoney,
  convertFromXof,
  resolveCurrency,
  CURRENCIES,
  CURRENCY_CODES,
  DEFAULT_CURRENCY,
};
