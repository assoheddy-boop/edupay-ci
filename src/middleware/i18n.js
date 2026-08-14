const { LOCALES, translate } = require('../i18n/catalog');
const { getPrefsCookieOptions, safeBack } = require('../utils/cookies');

const DEFAULT_LOCALE = 'fr';

function pickLocale(value) {
  return LOCALES.includes(value) ? value : null;
}

function resolveLocale(req) {
  return pickLocale(req.query.lang)
    || pickLocale(req.cookies?.locale)
    || pickLocale(req.user?.school?.locale)
    || pickLocale(req.user?.teacher?.school?.locale)
    || DEFAULT_LOCALE;
}

function applyI18n(req, res) {
  const locale = resolveLocale(req);
  const t = (key) => translate(locale, key);
  req.locale = locale;
  res.locals.locale = locale;
  res.locals.t = t;
  res.locals.locales = LOCALES;
  res.locals.htmlLang = locale === 'local' ? 'fr' : locale;
}

function i18nMiddleware(req, res, next) {
  applyI18n(req, res);
  next();
}

function setLocale(req, res) {
  const locale = pickLocale(req.params.locale) || DEFAULT_LOCALE;
  res.cookie('locale', locale, getPrefsCookieOptions());
  return res.redirect(safeBack(req));
}

module.exports = {
  i18nMiddleware,
  applyI18n,
  setLocale,
  resolveLocale,
  LOCALES,
  DEFAULT_LOCALE,
};
