-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "School" ADD COLUMN "groupId" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_groupId_key" ON "Organization"("groupId");
CREATE INDEX "School_groupId_idx" ON "School"("groupId");

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
