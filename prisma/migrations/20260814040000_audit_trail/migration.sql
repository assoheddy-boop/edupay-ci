-- CreateTable
CREATE TABLE "AuditTrail" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditTrail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditTrail_userId_timestamp_idx" ON "AuditTrail"("userId", "timestamp");
CREATE INDEX "AuditTrail_action_timestamp_idx" ON "AuditTrail"("action", "timestamp");

-- AddForeignKey
ALTER TABLE "AuditTrail" ADD CONSTRAINT "AuditTrail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
