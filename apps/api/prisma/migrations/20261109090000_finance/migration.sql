-- AlterTable
ALTER TABLE "ParrainProfile" ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'SEPA_DEBIT';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE "MonthlyAmountChange" (
    "id" TEXT NOT NULL,
    "sponsorshipId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "fromCents" INTEGER NOT NULL,
    "toCents" INTEGER NOT NULL,
    "effectivePeriodKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyAmountChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalReceipt" (
    "id" TEXT NOT NULL,
    "parrainId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paymentCount" INTEGER NOT NULL,
    "methods" "PaymentMethod"[],
    "donorName" TEXT NOT NULL,
    "donorAddress" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyAmountChange_sponsorshipId_createdAt_idx" ON "MonthlyAmountChange"("sponsorshipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalReceipt_number_key" ON "FiscalReceipt"("number");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalReceipt_parrainId_year_key" ON "FiscalReceipt"("parrainId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalReceipt_year_sequence_key" ON "FiscalReceipt"("year", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "MonthlyAmountChange" ADD CONSTRAINT "MonthlyAmountChange_sponsorshipId_fkey" FOREIGN KEY ("sponsorshipId") REFERENCES "Sponsorship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyAmountChange" ADD CONSTRAINT "MonthlyAmountChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalReceipt" ADD CONSTRAINT "FiscalReceipt_parrainId_fkey" FOREIGN KEY ("parrainId") REFERENCES "ParrainProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

