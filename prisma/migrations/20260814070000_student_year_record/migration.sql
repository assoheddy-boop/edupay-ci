-- CreateTable
CREATE TABLE "StudentYearRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolYear" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "schoolId" TEXT,
    "repeatYear" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gender" TEXT,

    CONSTRAINT "StudentYearRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentYearRecord_schoolYear_studentId_idx" ON "StudentYearRecord"("schoolYear", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentYearRecord_studentId_schoolYear_key" ON "StudentYearRecord"("studentId", "schoolYear");

-- AddForeignKey
ALTER TABLE "StudentYearRecord" ADD CONSTRAINT "StudentYearRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentYearRecord" ADD CONSTRAINT "StudentYearRecord_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentYearRecord" ADD CONSTRAINT "StudentYearRecord_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
