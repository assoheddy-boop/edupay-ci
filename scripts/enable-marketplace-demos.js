/**
 * Active IGEST (VIP) + écoles EPV (Premium) sur le Marketplace.
 *   NODE_OPTIONS=--use-system-ca node scripts/enable-marketplace-demos.js
 */
require('dotenv/config');
const { enableMarketplaceDemos } = require('../src/services/marketplace');

enableMarketplaceDemos()
  .then(({ igest, epv }) => {
    if (igest.ok) {
      console.log(`IGEST : portail ${igest.slug || 'igest'} (${igest.count ?? 0} ligne(s)).`);
    } else {
      console.warn(`IGEST : ${igest.reason || 'échec partiel'}`);
    }
    if (epv.ok) {
      epv.results.forEach((row) => {
        if (row.ok) console.log(`EPV ${row.slug} : Premium publié.`);
        else console.warn(`EPV ${row.slug} : ${row.reason}`);
      });
    }
    console.log('Marketplace démo terminé.');
  })
  .catch((err) => {
    console.error('Marketplace démo : échec');
    console.error(err?.message || err);
    process.exit(1);
  });
