import { writeAudit } from '../access/audit.js';
import type { Tx } from '../access/repo.js';
import { createUnit } from '../units/repo.js';

import { claimCatalogSeed, insertNode } from './repo.js';

const categories = [
  { name: 'كهربا', codePrefix: 'ELC', iconKey: 'zap' },
  { name: 'صحي', codePrefix: 'PLM', iconKey: 'droplet' },
  { name: 'سيراميك', codePrefix: 'CER', iconKey: 'grid-2x2' },
  { name: 'دهانات', codePrefix: 'PNT', iconKey: 'paint-roller' },
  { name: 'أوكر ومقابض', codePrefix: 'HDW', iconKey: 'door-open' },
];
const units = [
  'قطعة',
  'متر',
  'م²',
  'م³',
  'كرتونة',
  'شيكارة',
  'لتر',
  'جالون',
  'لفة',
  'طقم',
  'كيلو',
];

export async function seedCatalog(tx: Tx, auditSecret: string) {
  if (!(await claimCatalogSeed(tx))) return;
  for (const [sortOrder, category] of categories.entries()) {
    const row = await insertNode(tx, category, null, sortOrder);
    await writeAudit(
      tx,
      auditSecret,
      null,
      null,
      'seed',
      'CatalogNode',
      row.id,
      null,
      row,
    );
  }
  for (const name of units) {
    const row = await createUnit(tx, name);
    await writeAudit(
      tx,
      auditSecret,
      null,
      null,
      'seed',
      'Unit',
      row.id,
      null,
      row,
    );
  }
}
