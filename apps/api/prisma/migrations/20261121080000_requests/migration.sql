-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'AWAITING_MANAGER', 'RETURNED', 'AT_PURCHASING', 'PAUSED', 'FULFILMENT', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RequestStage" AS ENUM ('DRAFT', 'AWAITING_MANAGER', 'RETURNED', 'AT_PURCHASING', 'PAUSED', 'AWAITING_APPROVAL', 'AWAITING_RECEIPT', 'REMAINING', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RequestUrgency" AS ENUM ('NORMAL', 'URGENT', 'VERY_URGENT');

-- CreateEnum
CREATE TYPE "RequestItemState" AS ENUM ('OPEN', 'UNAVAILABLE', 'AWAITING_APPROVAL', 'AWAITING_RECEIPT', 'REMAINING', 'RECEIVED', 'RESOLVED_EXTERNALLY', 'REJECTED', 'CANCELLED', 'REMOVED');

-- CreateTable
CREATE TABLE "Request" (
    "id" SERIAL NOT NULL,
    "number" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL,
    "status" "RequestStatus" NOT NULL,
    "displayedStage" "RequestStage" NOT NULL,
    "stageStartedAt" TIMESTAMP(3) NOT NULL,
    "siteId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "urgency" "RequestUrgency" NOT NULL,
    "urgencyLocked" BOOLEAN NOT NULL,
    "isModified" BOOLEAN NOT NULL,
    "unitOrClient" TEXT,
    "note" TEXT,
    "deliveryFee" DECIMAL(14,2),
    "pausedById" INTEGER,
    "pausedAt" TIMESTAMP(3),
    "pauseReason" TEXT,
    "approvedById" INTEGER,
    "copiedFromId" INTEGER,
    "rounds" JSONB NOT NULL DEFAULT '[]',
    "batches" JSONB NOT NULL DEFAULT '[]',
    "supplyOrders" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestItem" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "catalogItemId" INTEGER,
    "nodeId" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "specs" TEXT NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "unitId" INTEGER NOT NULL,
    "otherName" TEXT,
    "state" "RequestItemState" NOT NULL,
    "receivedQty" DECIMAL(14,2) NOT NULL,
    "supplierId" INTEGER,
    "lineTotal" DECIMAL(14,2),
    "pricedQuantity" DECIMAL(14,2),
    "unavailableNote" TEXT,
    "needsRepricing" BOOLEAN NOT NULL,
    "modifiedAfterSend" BOOLEAN NOT NULL,
    "pickedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestNumberSequence" (
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL,

    CONSTRAINT "RequestNumberSequence_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" INTEGER,
    "actorName" TEXT,
    "actorRoleName" TEXT,
    "at" TIMESTAMP(3) NOT NULL,
    "itemIds" INTEGER[],
    "payload" JSONB NOT NULL,
    "stageAfter" "RequestStage" NOT NULL,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "requestId" INTEGER NOT NULL,
    "eventId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Request_number_key" ON "Request"("number");

-- CreateIndex
CREATE INDEX "Request_siteId_status_idx" ON "Request"("siteId", "status");

-- CreateIndex
CREATE INDEX "Request_categoryId_idx" ON "Request"("categoryId");

-- CreateIndex
CREATE INDEX "Request_createdById_categoryId_idx" ON "Request"("createdById", "categoryId");

-- CreateIndex
CREATE INDEX "Request_urgency_stageStartedAt_id_idx" ON "Request"("urgency" DESC, "stageStartedAt", "id");

-- CreateIndex
CREATE INDEX "Request_copiedFromId_idx" ON "Request"("copiedFromId");

-- CreateIndex
CREATE INDEX "RequestItem_catalogItemId_pickedAt_idx" ON "RequestItem"("catalogItemId", "pickedAt");

-- CreateIndex
CREATE INDEX "RequestItem_nodeId_idx" ON "RequestItem"("nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestItem_requestId_lineNo_key" ON "RequestItem"("requestId", "lineNo");

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_id_idx" ON "RequestEvent"("requestId", "id");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_id_idx" ON "Notification"("userId", "readAt", "id");

-- CreateIndex
CREATE INDEX "Notification_requestId_idx" ON "Notification"("requestId");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_eventId_userId_key" ON "Notification"("eventId", "userId");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CatalogNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_pausedById_fkey" FOREIGN KEY ("pausedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_copiedFromId_fkey" FOREIGN KEY ("copiedFromId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestItem" ADD CONSTRAINT "RequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestItem" ADD CONSTRAINT "RequestItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestItem" ADD CONSTRAINT "RequestItem_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "CatalogNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestItem" ADD CONSTRAINT "RequestItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestItem" ADD CONSTRAINT "RequestItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "RequestEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
