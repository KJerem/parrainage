-- CreateEnum
CREATE TYPE "CallSlotStatus" AS ENUM ('OPEN', 'HELD', 'BOOKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CallRequestStatus" AS ENUM ('REQUESTED', 'SLOTS_PROPOSED', 'CONFIRMED', 'CANCELLED', 'DECLINED');

-- CreateEnum
CREATE TYPE "VideoCallStatus" AS ENUM ('SCHEDULED', 'ENDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "callRequestId" TEXT;

-- CreateTable
CREATE TABLE "CallSlot" (
    "id" TEXT NOT NULL,
    "relaisId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" "CallSlotStatus" NOT NULL DEFAULT 'OPEN',
    "heldForId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallRequest" (
    "id" TEXT NOT NULL,
    "sponsorshipId" TEXT NOT NULL,
    "relaisId" TEXT NOT NULL,
    "status" "CallRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "slotId" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "conversationId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoCall" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "sponsorshipId" TEXT NOT NULL,
    "relaisId" TEXT NOT NULL,
    "slotId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "roomName" TEXT NOT NULL,
    "status" "VideoCallStatus" NOT NULL DEFAULT 'SCHEDULED',
    "joinedRelaisAt" TIMESTAMP(3),
    "joinedParrainAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallSlot_relaisId_status_startsAt_idx" ON "CallSlot"("relaisId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "CallSlot_heldForId_idx" ON "CallSlot"("heldForId");

-- CreateIndex
CREATE INDEX "CallSlot_createdById_idx" ON "CallSlot"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "CallSlot_relaisId_startsAt_key" ON "CallSlot"("relaisId", "startsAt");

-- CreateIndex
CREATE INDEX "CallRequest_sponsorshipId_status_idx" ON "CallRequest"("sponsorshipId", "status");

-- CreateIndex
CREATE INDEX "CallRequest_relaisId_status_idx" ON "CallRequest"("relaisId", "status");

-- CreateIndex
CREATE INDEX "CallRequest_slotId_idx" ON "CallRequest"("slotId");

-- CreateIndex
CREATE INDEX "CallRequest_createdById_idx" ON "CallRequest"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "VideoCall_requestId_key" ON "VideoCall"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoCall_slotId_key" ON "VideoCall"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoCall_roomName_key" ON "VideoCall"("roomName");

-- CreateIndex
CREATE INDEX "VideoCall_sponsorshipId_startsAt_idx" ON "VideoCall"("sponsorshipId", "startsAt");

-- CreateIndex
CREATE INDEX "VideoCall_relaisId_startsAt_idx" ON "VideoCall"("relaisId", "startsAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_callRequestId_fkey" FOREIGN KEY ("callRequestId") REFERENCES "CallRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSlot" ADD CONSTRAINT "CallSlot_relaisId_fkey" FOREIGN KEY ("relaisId") REFERENCES "Relais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSlot" ADD CONSTRAINT "CallSlot_heldForId_fkey" FOREIGN KEY ("heldForId") REFERENCES "CallRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSlot" ADD CONSTRAINT "CallSlot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRequest" ADD CONSTRAINT "CallRequest_sponsorshipId_fkey" FOREIGN KEY ("sponsorshipId") REFERENCES "Sponsorship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRequest" ADD CONSTRAINT "CallRequest_relaisId_fkey" FOREIGN KEY ("relaisId") REFERENCES "Relais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRequest" ADD CONSTRAINT "CallRequest_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "CallSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRequest" ADD CONSTRAINT "CallRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCall" ADD CONSTRAINT "VideoCall_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CallRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCall" ADD CONSTRAINT "VideoCall_sponsorshipId_fkey" FOREIGN KEY ("sponsorshipId") REFERENCES "Sponsorship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCall" ADD CONSTRAINT "VideoCall_relaisId_fkey" FOREIGN KEY ("relaisId") REFERENCES "Relais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCall" ADD CONSTRAINT "VideoCall_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "CallSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

