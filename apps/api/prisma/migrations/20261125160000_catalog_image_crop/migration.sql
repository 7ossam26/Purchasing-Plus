ALTER TABLE "CatalogItemImage"
    ADD COLUMN "cropX" INTEGER,
    ADD COLUMN "cropY" INTEGER,
    ADD COLUMN "cropSize" INTEGER,
    ADD CONSTRAINT "CatalogItemImage_crop_bounds" CHECK (
        ("cropX" IS NULL AND "cropY" IS NULL AND "cropSize" IS NULL)
        OR (
            "cropX" IS NOT NULL AND "cropY" IS NOT NULL AND "cropSize" IS NOT NULL
            AND "cropX" >= 0 AND "cropY" >= 0 AND "cropSize" > 0
            AND "cropX" <= "width" - "cropSize"
            AND "cropY" <= "height" - "cropSize"
        )
    );
