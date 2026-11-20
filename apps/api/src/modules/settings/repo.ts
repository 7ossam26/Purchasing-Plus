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

export function writeSettings(tx: Tx, data: Settings): Promise<Settings> {
  return tx.settings.update({ where: { id }, data, select });
}
