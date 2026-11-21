BEGIN;

-- CreateEnum
CREATE TYPE "PricingRoundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- P08 stored empty placeholders for these collections. P10 is their first write path.
ALTER TABLE "Request" DROP COLUMN "batches",
DROP COLUMN "rounds";

-- CreateTable
CREATE TABLE "RfqBatch" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "RfqBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqBatchItem" (
    "batchId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,

    CONSTRAINT "RfqBatchItem_pkey" PRIMARY KEY ("batchId","itemId")
);

-- CreateTable
CREATE TABLE "RfqBatchSupplier" (
    "batchId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sentById" INTEGER,

    CONSTRAINT "RfqBatchSupplier_pkey" PRIMARY KEY ("batchId","supplierId"),
    CONSTRAINT "RfqBatchSupplier_sent_metadata" CHECK (("sentAt" IS NULL) = ("sentById" IS NULL))
);

-- CreateTable
CREATE TABLE "PricingRound" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "PricingRoundStatus" NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "submittedById" INTEGER NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedById" INTEGER,
    "deliveryFee" DECIMAL(14,2),

    CONSTRAINT "PricingRound_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PricingRound_valid_number" CHECK ("number" > 0),
    CONSTRAINT "PricingRound_nonnegative_fee" CHECK ("deliveryFee" >= 0)
);

-- CreateTable
CREATE TABLE "PricingRoundItem" (
    "roundId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "catalogItemId" INTEGER,
    "supplierId" INTEGER NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PricingRoundItem_pkey" PRIMARY KEY ("roundId","itemId"),
    CONSTRAINT "PricingRoundItem_positive_amounts" CHECK ("lineTotal" > 0 AND "quantity" > 0)
);

-- CreateIndex
CREATE INDEX "RfqBatch_requestId_id_idx" ON "RfqBatch"("requestId", "id");

-- CreateIndex
CREATE INDEX "RfqBatchItem_itemId_idx" ON "RfqBatchItem"("itemId");

-- CreateIndex
CREATE INDEX "RfqBatchSupplier_supplierId_idx" ON "RfqBatchSupplier"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRound_requestId_number_key" ON "PricingRound"("requestId", "number");

-- CreateIndex
CREATE INDEX "PricingRoundItem_itemId_idx" ON "PricingRoundItem"("itemId");

-- CreateIndex
CREATE INDEX "PricingRoundItem_supplierId_idx" ON "PricingRoundItem"("supplierId");

-- AddForeignKey
ALTER TABLE "RfqBatch" ADD CONSTRAINT "RfqBatch_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqBatch" ADD CONSTRAINT "RfqBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqBatchItem" ADD CONSTRAINT "RfqBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RfqBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqBatchItem" ADD CONSTRAINT "RfqBatchItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "RequestItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqBatchSupplier" ADD CONSTRAINT "RfqBatchSupplier_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RfqBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqBatchSupplier" ADD CONSTRAINT "RfqBatchSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqBatchSupplier" ADD CONSTRAINT "RfqBatchSupplier_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRound" ADD CONSTRAINT "PricingRound_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRound" ADD CONSTRAINT "PricingRound_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRound" ADD CONSTRAINT "PricingRound_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRoundItem" ADD CONSTRAINT "PricingRoundItem_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "PricingRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRoundItem" ADD CONSTRAINT "PricingRoundItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "RequestItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRoundItem" ADD CONSTRAINT "PricingRoundItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
