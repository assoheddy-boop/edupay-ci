-- CreateEnum
CREATE TYPE "HomeworkKind" AS ENUM ('HOMEWORK', 'TEST');

-- AlterTable
ALTER TABLE "Homework" ADD COLUMN "kind" "HomeworkKind" NOT NULL DEFAULT 'HOMEWORK';
ALTER TABLE "Homework" ADD COLUMN "subject" TEXT;
ALTER TABLE "Homework" ADD COLUMN "remindAt" TIMESTAMP(3);
ALTER TABLE "Homework" ADD COLUMN "remindedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Homework_remindAt_remindedAt_idx" ON "Homework"("remindAt", "remindedAt");

-- CreateIndex
CREATE INDEX "Homework_dueDate_idx" ON "Homework"("dueDate");
