/**
 * Active Compta + RH pour les écoles Premium (dont IGEST) en prod Neon.
 * Usage: node scripts/sync-premium-modules.js
 */
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { PLANS } = require('../src/config/plans');
const { updatePlanFeatures, ensureSubscriptionPlans } = require('../src/utils/plans');
const { setModule } = require('../src/utils/modules');
const { IGEST_SCHOOL } = require('../src/config/igestSchool');

function readNeonUrl() {
  const neonFile = path.join(__dirname, '../.neon-url.tmp');
  if (fs.existsSync(neonFile)) {
    const line = fs.readFileSync(neonFile, 'utf8').split(/\r?\n/).find((l) => /^postgres/i.test(l.trim()));
    if (line) return line.trim();
  }
  return process.env.DATABASE_URL || null;
}

async function main() {
  const url = readNeonUrl();
  if (!url) {
    console.error('DATABASE_URL / .neon-url.tmp introuvable');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, ssl: /neon/i.test(url) ? { rejectUnauthorized: false } : false });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const plans = await ensureSubscriptionPlans();
  const premium = plans.find((p) => p.slug === 'premium' || p.name === 'Premium');
  if (!premium) {
    console.error('Plan Premium introuvable');
    process.exit(1);
  }

  const keys = PLANS.premium.modules;
  const result = await updatePlanFeatures(premium.id, keys);
  console.log(`Plan Premium synchronisé (${keys.length} modules, accounting+hr inclus)`);

  const igest = await prisma.school.findFirst({ where: { slug: IGEST_SCHOOL.slug } });
  if (igest) {
    for (const key of ['accounting', 'hr']) {
      await setModule(igest.id, key, { enabled: true, locked: true });
    }
    console.log(`IGEST (${igest.name}) : accounting + hr activés`);
  } else {
    console.log('École IGEST non trouvée par slug');
  }

  if (result.ok) {
    const schools = await prisma.school.findMany({
      where: { planId: premium.id },
      select: { name: true, slug: true },
    });
    console.log(`Écoles Premium resynchronisées : ${schools.length}`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
