import type { Settings } from '@purchasing-plus/shared';

import type { Context } from '../access/endpoint.js';

import { readSettings, writeSettings } from './repo.js';

export async function updateSettings({ tx, audit }: Context, input: Settings) {
  const before = await readSettings(tx);
  const after = await writeSettings(tx, input);
  await audit('settings.update', 'Settings', null, before, after);
  return after;
}
