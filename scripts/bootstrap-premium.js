require('dotenv/config');
const { bootstrapPremiumPlatform } = require('../src/utils/modules');

bootstrapPremiumPlatform()
  .then((count) => {
    console.log(`✅ Plateforme premium : ${count} école(s) — tous modules activés et verrouillés`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
