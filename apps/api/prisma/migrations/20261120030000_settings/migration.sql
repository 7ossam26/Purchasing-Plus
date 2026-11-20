CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL,
    "rfqIntro" TEXT NOT NULL,
    "supplyOrderIntro" TEXT NOT NULL,
    "agingDays" INTEGER NOT NULL DEFAULT 3,
    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Settings_singleton" CHECK ("id" = 1),
    CONSTRAINT "Settings_agingDays_range" CHECK ("agingDays" BETWEEN 1 AND 60)
);
