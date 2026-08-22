/**
 * Verify correspondance demo DB state (read-only).
 * Usage: node scripts/verify-correspondance-demo.js
 */
require('dotenv/config');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const url = fs.readFileSync('.neon-url.tmp', 'utf8').split(/\r?\n/).find((l) => /^postgres/i.test(l.trim()))?.trim();
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const igest = await prisma.school.findFirst({
    where: { slug: 'igest-yopougon-sideci' },
    include: {
      modules: { where: { moduleKey: 'correspondance' } },
      correspondancesAsEcole: {
        include: {
          partenaire: { select: { name: true, slug: true, correspondanceCountry: true } },
          messages: { select: { id: true, contenu: true, scope: true } },
          projets: { select: { id: true, titre: true } },
          calendrier: { select: { id: true, evenement: true, date: true } },
        },
      },
    },
  });

  console.log('IGEST correspondance ready:', Boolean(igest?.modules[0]?.enabled));
  console.log('Jumelages:', igest?.correspondancesAsEcole?.length || 0);
  for (const j of igest?.correspondancesAsEcole || []) {
    console.log(JSON.stringify({
      id: j.id,
      status: j.status,
      dateJumelage: j.dateJumelage,
      partner: j.partenaire.name,
      partnerSlug: j.partenaire.slug,
      messages: j.messages.length,
      projets: j.projets.map((p) => p.titre),
      events: j.calendrier.map((e) => e.evenement),
    }, null, 2));
  }
}

main().finally(async () => {
  await prisma.$disconnect();
  await pool.end();
});
