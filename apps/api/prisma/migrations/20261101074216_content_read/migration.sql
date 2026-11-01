-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('PHOTO', 'VIDEO', 'BULLETIN', 'DOCUMENT', 'CONSENT', 'RECEIPT', 'AVATAR');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING_UPLOAD', 'READY', 'REJECTED', 'PLACEHOLDER');

-- CreateEnum
CREATE TYPE "NewsPostType" AS ENUM ('ONE_CHILD', 'SEVERAL_CHILDREN', 'RELAIS_LIFE');

-- CreateEnum
CREATE TYPE "NewsPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "SentFrom" AS ENUM ('WEB', 'MOBILE', 'SCHOOL_SESSION');

-- CreateEnum
CREATE TYPE "AcademicPeriodKind" AS ENUM ('T1', 'T2', 'T3', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SchoolResultStatus" AS ENUM ('TO_ENTER', 'DRAFT', 'SENT');

-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('SPONSORSHIP', 'PARRAIN_RELAIS', 'RELAIS_BUREAU', 'PARRAIN_BUREAU', 'CHILD_ASSOCIATION');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'ENCOURAGEMENT', 'CALL_REQUEST', 'CALL_SLOTS', 'SYSTEM', 'NEWSLETTER');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'HELD', 'MASKED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'VERIFIED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('PHONE', 'DIGITS', 'NUMBER_WORDS', 'EMAIL', 'URL', 'SOCIAL', 'ADDRESS', 'MONEY', 'MEETING');

-- CreateEnum
CREATE TYPE "ManualFlag" AS ENUM ('OTHER_CHILD_FACE', 'THIRD_PARTY_PHOTO', 'INAPPROPRIATE_CONTENT', 'DIRECT_CONTACT', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('MONTHLY', 'ONE_OFF');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('SEPA_DEBIT', 'CARD', 'TRANSFER', 'CHEQUE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SCHEDULED', 'RECEIVED', 'LATE', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "photoMediaId" TEXT;

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "storageKey" TEXT,
    "posterKey" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "label" TEXT,
    "uploadedByUserId" TEXT,
    "messageId" TEXT,
    "newsPostId" TEXT,
    "schoolResultId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsPost" (
    "id" TEXT NOT NULL,
    "relaisId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "type" "NewsPostType" NOT NULL,
    "status" "NewsPostStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "notifyParrains" BOOLEAN NOT NULL DEFAULT true,
    "notifyBureau" BOOLEAN NOT NULL DEFAULT false,
    "visibleToChildren" BOOLEAN NOT NULL DEFAULT false,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "sentFrom" "SentFrom" NOT NULL DEFAULT 'WEB',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsPostChild" (
    "newsPostId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,

    CONSTRAINT "NewsPostChild_pkey" PRIMARY KEY ("newsPostId","childId")
);

-- CreateTable
CREATE TABLE "AcademicPeriod" (
    "id" TEXT NOT NULL,
    "schoolYear" TEXT NOT NULL,
    "kind" "AcademicPeriodKind" NOT NULL,
    "label" TEXT NOT NULL,
    "dueDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolResult" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "averageX100" INTEGER,
    "rank" INTEGER,
    "classSize" INTEGER,
    "appreciation" TEXT,
    "status" "SchoolResultStatus" NOT NULL DEFAULT 'TO_ENTER',
    "allowChildUpload" BOOLEAN NOT NULL DEFAULT false,
    "enteredById" TEXT,
    "sentAt" TIMESTAMP(3),
    "clientUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "kind" "ConversationKind" NOT NULL,
    "sponsorshipId" TEXT,
    "childId" TEXT,
    "relaisId" TEXT,
    "parrainId" TEXT,
    "subject" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT,
    "childId" TEXT,
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
    "body" TEXT NOT NULL,
    "redactedBody" TEXT,
    "moderationStatus" "ModerationStatus" NOT NULL,
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'SENT',
    "autoAlerts" JSONB NOT NULL DEFAULT '[]',
    "alertTypes" "AlertType"[] DEFAULT ARRAY[]::"AlertType"[],
    "manualFlags" "ManualFlag"[] DEFAULT ARRAY[]::"ManualFlag"[],
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "moderationReason" TEXT,
    "sentFrom" "SentFrom" NOT NULL DEFAULT 'WEB',
    "readAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "authorUserId" TEXT,
    "authorChildId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "parrainId" TEXT NOT NULL,
    "sponsorshipId" TEXT,
    "childId" TEXT,
    "kind" "PaymentKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "label" TEXT,
    "dueDate" DATE NOT NULL,
    "paidAt" TIMESTAMP(3),
    "status" "PaymentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reference" TEXT NOT NULL,
    "periodKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Media_storageKey_key" ON "Media"("storageKey");

-- CreateIndex
CREATE INDEX "Media_messageId_idx" ON "Media"("messageId");

-- CreateIndex
CREATE INDEX "Media_newsPostId_idx" ON "Media"("newsPostId");

-- CreateIndex
CREATE INDEX "Media_schoolResultId_idx" ON "Media"("schoolResultId");

-- CreateIndex
CREATE INDEX "Media_uploadedByUserId_idx" ON "Media"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "Media_status_createdAt_idx" ON "Media"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsPost_idempotencyKey_key" ON "NewsPost"("idempotencyKey");

-- CreateIndex
CREATE INDEX "NewsPost_relaisId_status_publishedAt_idx" ON "NewsPost"("relaisId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "NewsPost_status_scheduledAt_idx" ON "NewsPost"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "NewsPostChild_childId_idx" ON "NewsPostChild"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicPeriod_schoolYear_kind_key" ON "AcademicPeriod"("schoolYear", "kind");

-- CreateIndex
CREATE INDEX "SchoolResult_periodId_status_idx" ON "SchoolResult"("periodId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolResult_childId_periodId_key" ON "SchoolResult"("childId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_sponsorshipId_key" ON "Conversation"("sponsorshipId");

-- CreateIndex
CREATE INDEX "Conversation_kind_lastMessageAt_idx" ON "Conversation"("kind", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_childId_idx" ON "Conversation"("childId");

-- CreateIndex
CREATE INDEX "Conversation_relaisId_lastMessageAt_idx" ON "Conversation"("relaisId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_parrainId_lastMessageAt_idx" ON "Conversation"("parrainId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_idx" ON "ConversationParticipant"("userId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_childId_idx" ON "ConversationParticipant"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_userId_key" ON "ConversationParticipant"("conversationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_childId_key" ON "ConversationParticipant"("conversationId", "childId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_idempotencyKey_key" ON "Message"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_moderationStatus_createdAt_idx" ON "Message"("moderationStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Message_authorUserId_idx" ON "Message"("authorUserId");

-- CreateIndex
CREATE INDEX "Message_authorChildId_createdAt_idx" ON "Message"("authorChildId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_reviewedById_idx" ON "Message"("reviewedById");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE INDEX "Payment_parrainId_dueDate_idx" ON "Payment"("parrainId", "dueDate");

-- CreateIndex
CREATE INDEX "Payment_childId_dueDate_idx" ON "Payment"("childId", "dueDate");

-- CreateIndex
CREATE INDEX "Payment_status_dueDate_idx" ON "Payment"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_sponsorshipId_periodKey_key" ON "Payment"("sponsorshipId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "Child_photoMediaId_key" ON "Child"("photoMediaId");

-- CreateIndex
CREATE INDEX "Child_createdById_idx" ON "Child"("createdById");

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_photoMediaId_fkey" FOREIGN KEY ("photoMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_newsPostId_fkey" FOREIGN KEY ("newsPostId") REFERENCES "NewsPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_schoolResultId_fkey" FOREIGN KEY ("schoolResultId") REFERENCES "SchoolResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsPost" ADD CONSTRAINT "NewsPost_relaisId_fkey" FOREIGN KEY ("relaisId") REFERENCES "Relais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsPost" ADD CONSTRAINT "NewsPost_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsPostChild" ADD CONSTRAINT "NewsPostChild_newsPostId_fkey" FOREIGN KEY ("newsPostId") REFERENCES "NewsPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsPostChild" ADD CONSTRAINT "NewsPostChild_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResult" ADD CONSTRAINT "SchoolResult_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResult" ADD CONSTRAINT "SchoolResult_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AcademicPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResult" ADD CONSTRAINT "SchoolResult_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_sponsorshipId_fkey" FOREIGN KEY ("sponsorshipId") REFERENCES "Sponsorship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_relaisId_fkey" FOREIGN KEY ("relaisId") REFERENCES "Relais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_parrainId_fkey" FOREIGN KEY ("parrainId") REFERENCES "ParrainProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorChildId_fkey" FOREIGN KEY ("authorChildId") REFERENCES "Child"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_parrainId_fkey" FOREIGN KEY ("parrainId") REFERENCES "ParrainProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_sponsorshipId_fkey" FOREIGN KEY ("sponsorshipId") REFERENCES "Sponsorship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Contraintes hors schéma Prisma (ajoutées à la main, conservées par les migrations suivantes).
-- Un participant est soit un adulte, soit un enfant.
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_one_party_check" CHECK (("userId" IS NULL) <> ("childId" IS NULL));

-- Un message a au plus un auteur (aucun pour un message système).
ALTER TABLE "Message" ADD CONSTRAINT "Message_single_author_check" CHECK ("authorUserId" IS NULL OR "authorChildId" IS NULL);

-- `periodKey` (AAAA-MM) est renseigné pour les mensualités, et seulement pour elles.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_period_key_check" CHECK ((("kind" = 'MONTHLY') = ("periodKey" IS NOT NULL)) AND ("periodKey" IS NULL OR "periodKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'));
