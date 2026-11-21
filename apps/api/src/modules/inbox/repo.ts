import type { Prisma } from '@prisma/client';

import { siteWhere, type Viewer } from '../../middleware/access.js';
import type { Tx } from '../access/repo.js';

const select = {
  id: true,
  number: true,
  urgency: true,
  isModified: true,
  displayedStage: true,
  stageStartedAt: true,
  site: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
  items: { select: { state: true } },
} satisfies Prisma.RequestSelect;

export async function firstQueuePage(
  tx: Tx,
  viewer: Viewer,
  filter: Prisma.RequestWhereInput,
) {
  const where = { AND: [siteWhere(viewer), filter] };
  const rows = await tx.request.findMany({
    where,
    select,
    take: 30,
    orderBy: [{ urgency: 'desc' }, { stageStartedAt: 'asc' }, { id: 'asc' }],
  });
  const count = await tx.request.count({ where });
  return { rows, count };
}
