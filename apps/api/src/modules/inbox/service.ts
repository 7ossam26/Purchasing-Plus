import { queueNames, stateCounts } from '@purchasing-plus/shared/lifecycle';

import { allowed } from '../../middleware/access.js';
import type { Context } from '../access/endpoint.js';
import { queueWhere } from '../requests/repo.js';

import { firstQueuePage } from './repo.js';

export async function getInbox({ tx, viewer }: Context) {
  if (!allowed(viewer, 'requests.view')) return { queues: [] };
  const queues = [];
  for (const id of queueNames) {
    const filter = queueWhere(viewer, id);
    if (!filter) continue;
    const { rows, count } = await firstQueuePage(tx, viewer, filter);
    queues.push({
      id,
      count,
      items: rows.map(({ items, ...row }) => ({
        ...row,
        stateCounts: stateCounts({ items }),
      })),
    });
  }
  return { queues };
}
