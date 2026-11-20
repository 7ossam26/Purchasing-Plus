-- CreateEnum
CREATE TYPE "CatalogAttributeType" AS ENUM ('TEXT', 'NUMBER', 'SELECT');

-- CreateEnum
CREATE TYPE "CatalogPriceSource" AS ENUM ('APPROVED', 'REPRICED');

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "catalogSeededAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CatalogNode" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" INTEGER,
    "codePrefix" TEXT,
    "iconKey" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "path" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,

    CONSTRAINT "CatalogNode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CatalogNode_category_fields" CHECK (
      ("parentId" IS NULL AND "depth" = 0 AND "codePrefix" IS NOT NULL AND "codePrefix" ~ '^[A-Z]{2,5}$' AND "iconKey" IS NOT NULL)
      OR ("parentId" IS NOT NULL AND "depth" > 0 AND "codePrefix" IS NULL AND "iconKey" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "AttributeDefinition" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CatalogAttributeType" NOT NULL,
    "unitLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AttributeDefinition_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AttributeDefinition_numeric_unit" CHECK ("unitLabel" IS NULL OR "type" = 'NUMBER')
);

-- CreateTable
CREATE TABLE "AttributeOption" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "attributeId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AttributeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeAttribute" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nodeId" INTEGER NOT NULL,
    "attributeId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "NodeAttribute_pkey" PRIMARY KEY ("nodeId","attributeId")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "searchText" TEXT NOT NULL,
    "nodeId" INTEGER NOT NULL,
    "unitId" INTEGER NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItemAttributeValue" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "itemId" INTEGER NOT NULL,
    "attributeId" INTEGER NOT NULL,
    "textValue" TEXT,
    "numberValue" DECIMAL(38,12),
    "optionId" INTEGER,

    CONSTRAINT "CatalogItemAttributeValue_pkey" PRIMARY KEY ("itemId","attributeId"),
    CONSTRAINT "CatalogItemAttributeValue_one_value" CHECK (num_nonnulls("textValue", "numberValue", "optionId") = 1)
);

-- CreateTable
CREATE TABLE "CatalogItemPrice" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "itemId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "requestId" INTEGER NOT NULL,
    "requestItemId" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "source" "CatalogPriceSource" NOT NULL,

    CONSTRAINT "CatalogItemPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeSequence" (
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastValue" INTEGER NOT NULL,

    CONSTRAINT "CodeSequence_pkey" PRIMARY KEY ("categoryId"),
    CONSTRAINT "CodeSequence_positive" CHECK ("lastValue" > 0)
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Supplier_egyptian_mobile" CHECK ("whatsappNumber" ~ '^201[0125][0-9]{8}$')
);

-- CreateTable
CREATE TABLE "SupplierCategory" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "SupplierCategory_pkey" PRIMARY KEY ("supplierId","categoryId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogNode_codePrefix_key" ON "CatalogNode"("codePrefix");

-- CreateIndex
CREATE INDEX "CatalogNode_parentId_sortOrder_id_idx" ON "CatalogNode"("parentId", "sortOrder", "id");

-- CreateIndex
CREATE INDEX "CatalogNode_path_idx" ON "CatalogNode" USING GIN ("path" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "AttributeDefinition_name_key" ON "AttributeDefinition"("name");

-- CreateIndex
CREATE INDEX "AttributeDefinition_isActive_name_idx" ON "AttributeDefinition"("isActive", "name");

-- CreateIndex
CREATE INDEX "AttributeOption_attributeId_sortOrder_id_idx" ON "AttributeOption"("attributeId", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeOption_attributeId_label_key" ON "AttributeOption"("attributeId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeOption_attributeId_id_key" ON "AttributeOption"("attributeId", "id");

-- CreateIndex
CREATE INDEX "NodeAttribute_nodeId_sortOrder_idx" ON "NodeAttribute"("nodeId", "sortOrder");

-- CreateIndex
CREATE INDEX "NodeAttribute_attributeId_idx" ON "NodeAttribute"("attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_name_key" ON "Unit"("name");

-- CreateIndex
CREATE INDEX "Unit_isActive_name_idx" ON "Unit"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_code_key" ON "CatalogItem"("code");

-- CreateIndex
CREATE INDEX "CatalogItem_nodeId_name_id_idx" ON "CatalogItem"("nodeId", "name", "id");

-- CreateIndex
CREATE INDEX "CatalogItem_unitId_idx" ON "CatalogItem"("unitId");

-- CreateIndex
CREATE INDEX "CatalogItem_searchText_idx" ON "CatalogItem" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CatalogItemAttributeValue_attributeId_optionId_idx" ON "CatalogItemAttributeValue"("attributeId", "optionId");

-- CreateIndex
CREATE INDEX "CatalogItemPrice_itemId_createdAt_id_idx" ON "CatalogItemPrice"("itemId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CatalogItemPrice_supplierId_idx" ON "CatalogItemPrice"("supplierId");

-- CreateIndex
CREATE INDEX "CatalogItemPrice_requestId_idx" ON "CatalogItemPrice"("requestId");

-- CreateIndex
CREATE INDEX "CatalogItemPrice_requestItemId_idx" ON "CatalogItemPrice"("requestItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_whatsappNumber_key" ON "Supplier"("whatsappNumber");

-- CreateIndex
CREATE INDEX "Supplier_isActive_name_id_idx" ON "Supplier"("isActive", "name", "id");

-- CreateIndex
CREATE INDEX "Supplier_name_id_idx" ON "Supplier"("name", "id");

-- CreateIndex
CREATE INDEX "SupplierCategory_categoryId_idx" ON "SupplierCategory"("categoryId");

-- AddForeignKey
ALTER TABLE "CatalogNode" ADD CONSTRAINT "CatalogNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CatalogNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeOption" ADD CONSTRAINT "AttributeOption_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttribute" ADD CONSTRAINT "NodeAttribute_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "CatalogNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttribute" ADD CONSTRAINT "NodeAttribute_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "CatalogNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItemAttributeValue" ADD CONSTRAINT "CatalogItemAttributeValue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItemAttributeValue" ADD CONSTRAINT "CatalogItemAttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItemAttributeValue" ADD CONSTRAINT "CatalogItemAttributeValue_attributeId_optionId_fkey" FOREIGN KEY ("attributeId", "optionId") REFERENCES "AttributeOption"("attributeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItemPrice" ADD CONSTRAINT "CatalogItemPrice_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItemPrice" ADD CONSTRAINT "CatalogItemPrice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeSequence" ADD CONSTRAINT "CodeSequence_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CatalogNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCategory" ADD CONSTRAINT "SupplierCategory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCategory" ADD CONSTRAINT "SupplierCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CatalogNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
