const path = require('path');

const envFile = process.env.ENV_FILE
  || process.argv.find((arg) => arg.startsWith('--env-file='))?.slice('--env-file='.length);
if (envFile) {
  require('dotenv').config({ path: path.resolve(envFile), override: true });
} else {
  require('dotenv/config');
}

const prisma = require('../src/config/database');
const { EXTRA_SCHOOLS } = require('../src/config/extraSchools');
const { generateTempPassword, validateEpvCatalog } = require('../src/config/epvSchools');
const { onboardSchools } = require('../src/utils/onboardSchools');

async function main() {
  const catalog = validateEpvCatalog(EXTRA_SCHOOLS);
  if (!catalog.ok) {
    throw new Error(`Catalogue partenaires invalide: ${catalog.errors.join('; ')}`);
  }

  const password = process.env.ONBOARD_TEMP_PASSWORD
    || generateTempPassword(EXTRA_SCHOOLS[0]?.slug);
  const results = await onboardSchools(EXTRA_SCHOOLS, { planSlug: 'premium', password });

  console.log(`\n✅ ${results.length} école(s) partenaire(s) dans EduConnect (hors EPV)\n`);
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

  console.log('Plan : Premium (même offre que les écoles partenaires déjà intégrées).');
  console.log('Les parents / profs utiliseront le code école (slug) à l’inscription.');
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
