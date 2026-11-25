-- A manually entered reference price. Existing items keep NULL ("not set"), which stays
-- distinct from an explicit 0.00. Purchase price records and pricing rounds are unchanged.
ALTER TABLE "CatalogItem" ADD COLUMN "unitPrice" DECIMAL(14,2);
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_unitPrice_nonnegative" CHECK ("unitPrice" >= 0);
