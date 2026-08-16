const LAST_UPDATED = '16 août 2026';

function renderLegal(view, title) {
  return (_req, res) => {
    res.render(`legal/${view}`, {
      user: null,
      title,
      lastUpdated: LAST_UPDATED,
      legalCurrent: view,
    });
  };
}

module.exports = {
  mentions: renderLegal('mentions', 'Mentions légales'),
  privacy: renderLegal('confidentialite', 'Politique de confidentialité'),
  terms: renderLegal('cgu', "Conditions générales d'utilisation"),
  cookies: renderLegal('cookies', 'Cookies'),
};
