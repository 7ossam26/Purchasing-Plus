BEGIN;

-- P12 is the first write path for the empty supplyOrders placeholder.
-- AlterTable
ALTER TABLE "Request" DROP COLUMN "supplyOrders";

-- AlterTable
ALTER TABLE "PricingRoundItem" ADD COLUMN     "previousPriceId" INTEGER;

-- CreateTable
CREATE TABLE "SupplyOrder" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sentById" INTEGER,

    CONSTRAINT "SupplyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyOrderItem" (
    "orderId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "catalogItemId" INTEGER,
    "quantity" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "SupplyOrderItem_pkey" PRIMARY KEY ("orderId","itemId")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "recordedById" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptLine" (
    "receiptId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "ReceiptLine_pkey" PRIMARY KEY ("receiptId","itemId")
);

-- CreateIndex
CREATE INDEX "SupplyOrder_requestId_sentAt_idx" ON "SupplyOrder"("requestId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyOrder_requestId_number_key" ON "SupplyOrder"("requestId", "number");

-- CreateIndex
CREATE INDEX "Receipt_requestId_id_idx" ON "Receipt"("requestId", "id");

-- AddForeignKey
ALTER TABLE "PricingRoundItem" ADD CONSTRAINT "PricingRoundItem_previousPriceId_fkey" FOREIGN KEY ("previousPriceId") REFERENCES "CatalogItemPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderItem" ADD CONSTRAINT "SupplyOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SupplyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderItem" ADD CONSTRAINT "SupplyOrderItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "RequestItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "RequestItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItemPrice" ADD CONSTRAINT "CatalogItemPrice_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItemPrice" ADD CONSTRAINT "CatalogItemPrice_requestItemId_fkey" FOREIGN KEY ("requestItemId") REFERENCES "RequestItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplyOrder" ADD CHECK (("sentAt" IS NULL) = ("sentById" IS NULL));
ALTER TABLE "SupplyOrderItem" ADD CHECK (quantity > 0 AND "lineTotal" > 0);
ALTER TABLE "ReceiptLine" ADD CHECK (quantity > 0);

COMMIT;
