const path = require('path');

const envFile = process.env.ENV_FILE
  || process.argv.find((arg) => arg.startsWith('--env-file='))?.slice('--env-file='.length);
if (envFile) {
  require('dotenv').config({ path: path.resolve(envFile), override: true });
} else {
  require('dotenv/config');
}

const prisma = require('../src/config/database');
const { EPV_SCHOOLS, validateEpvCatalog } = require('../src/config/epvSchools');
const { onboardSchools } = require('../src/utils/onboardSchools');

async function main() {
  const catalog = validateEpvCatalog(EPV_SCHOOLS);
  if (!catalog.ok) {
    throw new Error(`Catalogue EPV invalide: ${catalog.errors.join('; ')}`);
  }

  const results = await onboardSchools(EPV_SCHOOLS, { planSlug: 'premium' });

  console.log(`\n✅ ${results.length} école(s) EPV dans EduPay\n`);
  results.forEach((row) => {
    const mark = row.status === 'created' ? 'NEW' : row.status.toUpperCase();
    console.log(`- [${mark}] ${row.name}`);
    console.log(`    Ville      : ${row.city}`);
    console.log(`    Code école : ${row.slug}`);
    console.log(`    Direction  : ${row.email}`);
    if (row.password) console.log(`    Mot de passe temporaire : ${row.password}`);
    if (row.reason) console.log(`    Note      : ${row.reason}`);
    console.log('');
  });

  console.log('Les parents / profs utiliseront le code école (slug) à l’inscription.');
  console.log('Compléter plus tard : adresse, Wave, Orange Money, nom du directeur, téléphone.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(process.exitCode || 0);
  });
