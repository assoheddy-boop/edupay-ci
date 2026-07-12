/**
 * Safe SQL migration for existing DB — node scripts/migrate-safe.js
 */
require('dotenv/config');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function columnExists(table, column) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return r.rowCount > 0;
}

async function main() {
  if (!(await columnExists('School', 'slug'))) {
    await pool.query(`ALTER TABLE "School" ADD COLUMN "slug" TEXT`);
  }
  if (!(await columnExists('School', 'currentSchoolYear'))) {
    await pool.query(`ALTER TABLE "School" ADD COLUMN "currentSchoolYear" TEXT NOT NULL DEFAULT '2025-2026'`);
  }
  if (!(await columnExists('Student', 'schoolId'))) {
    await pool.query(`ALTER TABLE "Student" ADD COLUMN "schoolId" TEXT`);
  }
  if (!(await columnExists('AuditLog', 'schoolId'))) {
    await pool.query(`ALTER TABLE "AuditLog" ADD COLUMN "schoolId" TEXT`);
  }
  if (!(await columnExists('PickupAuthorization', 'qrDataUrl'))) {
    await pool.query(`ALTER TABLE "PickupAuthorization" ADD COLUMN "qrDataUrl" TEXT`);
  }

  await pool.query(`
    UPDATE "School" SET "slug" = LOWER(REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g'))
    WHERE "slug" IS NULL OR "slug" = ''
  `);

  await pool.query(`
    UPDATE "Student" s SET "schoolId" = c."schoolId"
    FROM "Class" c WHERE s."classId" = c.id AND s."schoolId" IS NULL
  `);

  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE "School" ADD CONSTRAINT "School_slug_key" UNIQUE ("slug");
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE "Student" ADD CONSTRAINT "Student_schoolId_matricule_key" UNIQUE ("schoolId", "matricule");
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_schoolId_fkey"
        FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE "Student" ADD CONSTRAINT "Student_schoolId_fkey"
        FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  console.log('✅ Migration SQL appliquée');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
