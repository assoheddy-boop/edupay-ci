/**
 * Active la page publique IGEST si l’école a un slug.
 * N’imprime jamais DATABASE_URL.
 *   NODE_OPTIONS=--use-system-ca node scripts/enable-igest-public-portal.js
 */
require('dotenv/config');
const { enableIgestPublicPortal } = require('../src/services/marketplace');

enableIgestPublicPortal()
  .then((result) => {
    if (result.ok && result.count) {
      console.log(`Portail public IGEST activé (${result.slug}).`);
    } else if (result.ok) {
      console.log(`Portail public IGEST : aucune ligne à mettre à jour (${result.slug || 'slug manquant'}).`);
    } else {
      console.error(`Portail public IGEST : ${result.reason}`);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Portail public IGEST : échec');
    console.error(err?.message || err);
    process.exit(1);
  });
