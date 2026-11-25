import { defaultSettings, type Settings } from '@purchasing-plus/shared';

import type { Tx } from '../access/repo.js';

const id = 1;
const select = { rfqIntro: true, supplyOrderIntro: true, agingDays: true };

export async function seedSettings(tx: Tx) {
  await tx.settings.upsert({
    where: { id },
    create: { id, ...defaultSettings },
    update: {},
  });
}

export function readSettings(tx: Tx): Promise<Settings> {
  return tx.settings.findUniqueOrThrow({ where: { id }, select });
}

// Replaces a stored template only while it still holds an earlier shipped default.
export async function replaceDefaultSupplyOrderIntro(
  tx: Tx,
  previous: readonly string[],
  current: string,
) {
  const before = await tx.settings.findFirst({
    where: { id, supplyOrderIntro: { in: [...previous] } },
    select,
  });
  if (!before) return null;
  const after = await tx.settings.update({
    where: { id },
    data: { supplyOrderIntro: current },
    select,
  });
  return { before, after };
}

export function writeSettings(tx: Tx, data: Settings): Promise<Settings> {
  return tx.settings.update({ where: { id }, data, select });
}
