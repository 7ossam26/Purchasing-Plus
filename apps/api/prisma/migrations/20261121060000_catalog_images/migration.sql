ALTER TABLE "AttributeDefinition" ADD COLUMN "clientVisible" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "CatalogItemImage" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "itemId" INTEGER NOT NULL,
    "thumbKey" TEXT NOT NULL,
    "displayKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "pendingDelete" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CatalogItemImage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CatalogItemImage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CatalogItemImage_thumbKey_key" ON "CatalogItemImage"("thumbKey");
CREATE UNIQUE INDEX "CatalogItemImage_displayKey_key" ON "CatalogItemImage"("displayKey");
CREATE INDEX "CatalogItemImage_itemId_sortOrder_id_idx" ON "CatalogItemImage"("itemId", "sortOrder", "id");
CREATE UNIQUE INDEX "CatalogItemImage_one_cover" ON "CatalogItemImage"("itemId") WHERE "isCover" AND NOT "pendingDelete";
