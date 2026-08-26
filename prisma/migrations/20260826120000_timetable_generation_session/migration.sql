-- CreateEnum
CREATE TYPE "TimetableGenerationStatus" AS ENUM ('DRAFT', 'GENERATED', 'APPLIED');

-- CreateTable
CREATE TABLE "TimetableGenerationSession" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Nouvelle session',
    "status" "TimetableGenerationStatus" NOT NULL DEFAULT 'DRAFT',
    "inputJson" JSONB,
    "outputJson" JSONB,
    "schoolYear" TEXT NOT NULL DEFAULT '2025-2026',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "schoolId" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "TimetableGenerationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimetableGenerationSession_schoolId_status_idx" ON "TimetableGenerationSession"("schoolId", "status");

-- CreateIndex
CREATE INDEX "TimetableGenerationSession_schoolId_createdAt_idx" ON "TimetableGenerationSession"("schoolId", "createdAt");

-- AddForeignKey
ALTER TABLE "TimetableGenerationSession" ADD CONSTRAINT "TimetableGenerationSession_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
