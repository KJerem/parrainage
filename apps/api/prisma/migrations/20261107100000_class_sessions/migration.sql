-- CreateEnum
CREATE TYPE "ClassSessionStatus" AS ENUM ('PLANNED', 'OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "codeLockedAt" TIMESTAMP(3),
ADD COLUMN     "failedCodeAttempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "uploadedByChildId" TEXT;

-- CreateTable
CREATE TABLE "ClassSession" (
    "id" TEXT NOT NULL,
    "relaisId" TEXT NOT NULL,
    "status" "ClassSessionStatus" NOT NULL DEFAULT 'PLANNED',
    "scheduledAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL,
    "allowWriteSponsor" BOOLEAN NOT NULL DEFAULT true,
    "allowMedia" BOOLEAN NOT NULL DEFAULT true,
    "allowBulletin" BOOLEAN NOT NULL DEFAULT true,
    "allowWriteAssociation" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "deviceTokenHash" TEXT,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "suspendedAt" TIMESTAMP(3),
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSessionChild" (
    "sessionId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "ClassSessionChild_pkey" PRIMARY KEY ("sessionId","childId")
);

-- CreateIndex
CREATE INDEX "ClassSession_relaisId_status_idx" ON "ClassSession"("relaisId", "status");

-- CreateIndex
CREATE INDEX "ClassSession_status_endsAt_idx" ON "ClassSession"("status", "endsAt");

-- CreateIndex
CREATE INDEX "ClassSession_createdById_idx" ON "ClassSession"("createdById");

-- CreateIndex
CREATE INDEX "ClassSessionChild_childId_idx" ON "ClassSessionChild"("childId");

-- CreateIndex
CREATE INDEX "Media_uploadedByChildId_idx" ON "Media"("uploadedByChildId");

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_uploadedByChildId_fkey" FOREIGN KEY ("uploadedByChildId") REFERENCES "Child"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_relaisId_fkey" FOREIGN KEY ("relaisId") REFERENCES "Relais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSessionChild" ADD CONSTRAINT "ClassSessionChild_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSessionChild" ADD CONSTRAINT "ClassSessionChild_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

