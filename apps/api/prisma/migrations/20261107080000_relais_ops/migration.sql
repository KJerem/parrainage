-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('SPONSORSHIP', 'MEDIA');

-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "codeHash" TEXT,
ADD COLUMN     "codeSetAt" TIMESTAMP(3),
ADD COLUMN     "consentDocumentId" TEXT;

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "textVersion" TEXT NOT NULL,
    "recordedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_childId_type_idx" ON "ConsentRecord"("childId", "type");

-- CreateIndex
CREATE INDEX "ConsentRecord_recordedById_idx" ON "ConsentRecord"("recordedById");

-- CreateIndex
CREATE UNIQUE INDEX "Child_consentDocumentId_key" ON "Child"("consentDocumentId");

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_consentDocumentId_fkey" FOREIGN KEY ("consentDocumentId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

