import type { Settings } from '@purchasing-plus/shared';

import { api } from './client.js';

export const settingsApi = {
  get: (signal: AbortSignal) => api<Settings>('/settings', { signal }),
  save: (body: Settings) => api<Settings>('/settings', { method: 'PUT', body }),
};
