/**
 * One-off: enable correspondance module on IGEST + create approved jumelage with French demo school.
 * Usage: node scripts/setup-correspondance-demo.js [--dry-run]
 * Reads DATABASE_URL from .neon-url.tmp (no .env).
 */
require('dotenv/config');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');

function readNeonUrl() {
  const url = fs
    .readFileSync('.neon-url.tmp', 'utf8')
    .split(/\r?\n/)
    .find((l) => /^postgres/i.test(l.trim()))
    ?.trim();
  if (!url) throw new Error('No postgres URL in .neon-url.tmp');
  return url;
}

const pool = new Pool({ connectionString: readNeonUrl(), ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const FR_SLUGS = ['college-victor-hugo-lyon', 'ecole-jean-moulin-paris'];
const IGEST_SLUG = 'igest-yopougon-sideci';

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== APPLY ===');

  const igest = await prisma.school.findFirst({
    where: { slug: IGEST_SLUG },
    select: {
      id: true,
      name: true,
      slug: true,
      correspondanceCountry: true,
      adminId: true,
      admin: { select: { id: true, email: true, firstName: true, lastName: true } },
      modules: { where: { moduleKey: 'correspondance' } },
    },
  });
  if (!igest) throw new Error(`IGEST not found (slug=${IGEST_SLUG})`);
  console.log('\nIGEST:', {
    id: igest.id,
    name: igest.name,
    correspondanceCountry: igest.correspondanceCountry,
    admin: igest.admin?.email,
    correspondanceModule: igest.modules[0] || 'NOT_CONFIGURED',
  });

  const frSchools = await prisma.school.findMany({
    where: { slug: { in: FR_SLUGS } },
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      correspondanceCountry: true,
      adminId: true,
      admin: { select: { id: true, email: true, firstName: true, lastName: true } },
      modules: { where: { moduleKey: 'correspondance' } },
    },
  });
  console.log('\nFrench demo schools:');
  for (const s of frSchools) {
    console.log(`  ${s.slug}: id=${s.id}, country=${s.correspondanceCountry}, admin=${s.admin?.email}, module=${JSON.stringify(s.modules[0] || null)}`);
  }

  const frPartner = frSchools.find((s) => s.slug === 'college-victor-hugo-lyon') || frSchools[0];
  if (!frPartner) throw new Error('No French demo school found in prod');

  // Ensure Premium plan includes correspondance (plan gating blocks /correspondance otherwise)
  const premiumPlan = await prisma.subscriptionPlan.findFirst({ where: { name: 'Premium' } });
  if (premiumPlan) {
    const features = premiumPlan.features || [];
    if (!features.includes('correspondance')) {
      console.log('\n→ Adding correspondance to Premium plan features');
      if (!DRY_RUN) {
        await prisma.subscriptionPlan.update({
          where: { id: premiumPlan.id },
          data: { features: [...features, 'correspondance'] },
        });
      }
    } else {
      console.log('\n✓ Premium plan already includes correspondance');
    }
  }

  // Enable correspondance module on both schools
  for (const school of [igest, frPartner]) {
    const existing = school.modules[0];
    if (!existing) {
      console.log(`\n→ Creating correspondance module for ${school.name}`);
      if (!DRY_RUN) {
        await prisma.schoolModule.create({
          data: { schoolId: school.id, moduleKey: 'correspondance', enabled: true, locked: true },
        });
      }
    } else if (!existing.enabled) {
      console.log(`\n→ Enabling correspondance module for ${school.name}`);
      if (!DRY_RUN) {
        await prisma.schoolModule.update({
          where: { id: existing.id },
          data: { enabled: true },
        });
      }
    } else {
      console.log(`\n✓ correspondance already enabled for ${school.name}`);
    }
  }

  // Ensure FR school has correspondanceCountry = FR
  if (frPartner.correspondanceCountry !== 'FR') {
    console.log(`\n→ Setting ${frPartner.slug} correspondanceCountry to FR`);
    if (!DRY_RUN) {
      await prisma.school.update({
        where: { id: frPartner.id },
        data: { correspondanceCountry: 'FR' },
      });
    }
  }

  // Check existing jumelage
  let jumelage = await prisma.ecoleCorrespondance.findFirst({
    where: {
      OR: [
        { ecoleId: igest.id, partenaireId: frPartner.id },
        { ecoleId: frPartner.id, partenaireId: igest.id },
      ],
    },
    include: {
      messages: true,
      projets: true,
      calendrier: true,
    },
  });

  const dateJumelage = new Date('2026-01-15T10:00:00Z');
  const igestAdminId = igest.adminId || igest.admin?.id;
  const frAdminId = frPartner.adminId || frPartner.admin?.id;

  if (!jumelage) {
    console.log(`\n→ Creating APPROVED jumelage IGEST ↔ ${frPartner.name}`);
    if (!DRY_RUN) {
      jumelage = await prisma.ecoleCorrespondance.create({
        data: {
          ecoleId: igest.id,
          partenaireId: frPartner.id,
          status: 'APPROVED',
          requestedById: igestAdminId,
          approvedById: frAdminId,
          approvedAt: dateJumelage,
          dateJumelage,
          note: 'Jumelage démo EduConnect — échange culturel CI-France 2026',
        },
        include: { messages: true, projets: true, calendrier: true },
      });
    }
  } else if (jumelage.status !== 'APPROVED') {
    console.log(`\n→ Updating jumelage ${jumelage.id} to APPROVED`);
    if (!DRY_RUN) {
      jumelage = await prisma.ecoleCorrespondance.update({
        where: { id: jumelage.id },
        data: {
          status: 'APPROVED',
          approvedById: frAdminId,
          approvedAt: dateJumelage,
          dateJumelage: jumelage.dateJumelage || dateJumelage,
        },
        include: { messages: true, projets: true, calendrier: true },
      });
    }
  } else {
    console.log(`\n✓ Jumelage already APPROVED: ${jumelage.id}`);
  }

  if (!jumelage && DRY_RUN) {
    console.log('\nWould create jumelage + demo content (dry run)');
    return;
  }

  if (!jumelage) return;

  // Demo messages
  if (jumelage.messages.length === 0 && igestAdminId && frAdminId) {
    console.log('\n→ Creating sample messages');
    if (!DRY_RUN) {
      await prisma.messageCorrespondance.createMany({
        data: [
          {
            jumelageId: jumelage.id,
            expediteurId: igestAdminId,
            destinataireId: frAdminId,
            contenu:
              'Bonjour de Yopougon ! Nous sommes ravis de lancer ce jumelage avec le Collège Victor Hugo. Nos élèves de 4e préparent déjà des présentations sur la culture ivoirienne.',
            scope: 'ADMIN',
          },
          {
            jumelageId: jumelage.id,
            expediteurId: frAdminId,
            destinataireId: igestAdminId,
            contenu:
              'Bonjour Madame Dongo ! Nos classes de 5e sont enthousiastes. Proposons une visioconférence de lancement fin mars pour présenter nos établissements respectifs.',
            scope: 'ADMIN',
          },
        ],
      });
    }
  } else {
    console.log(`\n✓ Messages already exist (${jumelage.messages.length})`);
  }

  // Demo projet
  if (jumelage.projets.length === 0 && igestAdminId) {
    console.log('\n→ Creating sample projet');
    if (!DRY_RUN) {
      await prisma.projetCorrespondance.create({
        data: {
          jumelageId: jumelage.id,
          titre: 'Échange culturel CI-France 2026',
          description:
            'Projet pédagogique bilatéral : présentations vidéo des traditions (Attiéké vs gastronomie lyonnaise), correspondance entre classes de 4e/5e, et mini-exposé sur l\'histoire des liens Abidjan–Lyon.',
          createdById: igestAdminId,
        },
      });
    }
  } else {
    console.log(`\n✓ Projets already exist (${jumelage.projets.length})`);
  }

  // Demo calendar event
  if (jumelage.calendrier.length === 0 && frAdminId) {
    console.log('\n→ Creating sample calendar event');
    if (!DRY_RUN) {
      await prisma.calendrierCorrespondance.create({
        data: {
          jumelageId: jumelage.id,
          evenement: 'Visioconférence de lancement du jumelage',
          description: 'Rencontre en ligne entre les directions et les classes pilotes (4e IGEST ↔ 5e Victor Hugo).',
          date: new Date('2026-03-28T14:00:00Z'),
          endDate: new Date('2026-03-28T15:30:00Z'),
          participants: ['Direction IGEST', 'Direction Victor Hugo', 'Classes 4e & 5e'],
          createdById: frAdminId,
        },
      });
    }
  } else {
    console.log(`\n✓ Calendar events already exist (${jumelage.calendrier.length})`);
  }

  // Final state
  const final = await prisma.ecoleCorrespondance.findUnique({
    where: { id: jumelage.id },
    include: {
      ecole: { select: { name: true, slug: true } },
      partenaire: { select: { name: true, slug: true } },
      messages: { select: { id: true } },
      projets: { select: { id: true, titre: true } },
      calendrier: { select: { id: true, evenement: true } },
    },
  });

  const igestMod = await prisma.schoolModule.findUnique({
    where: { schoolId_moduleKey: { schoolId: igest.id, moduleKey: 'correspondance' } },
  });

  console.log('\n=== FINAL STATE ===');
  console.log(JSON.stringify({
    igestId: igest.id,
    igestModule: igestMod,
    partner: { id: frPartner.id, name: frPartner.name, slug: frPartner.slug },
    jumelage: {
      id: final?.id,
      status: final?.status,
      dateJumelage: final?.dateJumelage,
      messages: final?.messages?.length,
      projets: final?.projets,
      calendrier: final?.calendrier,
    },
  }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
