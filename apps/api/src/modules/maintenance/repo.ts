import { Prisma } from '@prisma/client';

import type { Tx } from '../access/repo.js';

export async function supportPassword(tx: Tx, id: number) {
  const user = await tx.user.findUniqueOrThrow({
    where: { id },
    select: { passwordHash: true },
  });
  return user.passwordHash;
}

export async function resetOperationalData(tx: Tx) {
  // RESTRICT makes new foreign-key dependencies fail closed. Keep identities
  // monotonic so old audit references and live notification cursors stay unique.
  await tx.$executeRaw(Prisma.sql`
    TRUNCATE TABLE "Request", "RequestItem", "RfqBatch", "RfqBatchItem",
      "RfqBatchSupplier", "PricingRound", "PricingRoundItem", "SupplyOrder",
      "SupplyOrderItem", "Receipt", "ReceiptLine", "RequestEvent", "Notification",
      "CatalogItemPrice", "RequestNumberSequence"
    CONTINUE IDENTITY RESTRICT
  `);
}
