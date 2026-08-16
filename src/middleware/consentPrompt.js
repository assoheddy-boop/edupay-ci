const {
  needsFirstLoginConsent,
  CONSENT_LABELS,
  CONSENT_HINTS,
} = require('../../services/ConsentService');

const DISMISS_COOKIE = 'consent_prompt_done';

function skipConsentPromptPath(req) {
  const path = req.path || '';
  return path === '/privacy' || path === '/privacy/first-login';
}

function attachConsentPrompt(req, res, next) {
  res.locals.needsConsentPrompt = false;
  res.locals.consentLabels = CONSENT_LABELS;
  res.locals.consentHints = CONSENT_HINTS;

  if (req.user?.role !== 'PARENT') return next();
  if (skipConsentPromptPath(req)) return next();
  if (req.cookies?.[DISMISS_COOKIE] === '1') return next();

  needsFirstLoginConsent(req.user.id)
    .then((needed) => {
      res.locals.needsConsentPrompt = !!needed;
      next();
    })
    .catch(next);
}

module.exports = { attachConsentPrompt, DISMISS_COOKIE, skipConsentPromptPath };
