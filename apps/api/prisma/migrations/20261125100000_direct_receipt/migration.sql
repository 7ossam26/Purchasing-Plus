-- Pricing approval was removed: submitted pricing goes straight to receipt.
-- Requests still waiting for the removed approval are released by the idempotent startup
-- migration in src/modules/fulfilment/migration.ts, which also writes the timeline, audit and
-- notification rows that plain SQL cannot sign.
ALTER TYPE "PricingRoundStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "CatalogPriceSource" ADD VALUE IF NOT EXISTS 'SUBMITTED';
