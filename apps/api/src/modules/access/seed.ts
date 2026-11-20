import { hash } from '@node-rs/argon2';
import type { PrismaClient } from '@prisma/client';
import { createSupport } from '@purchasing-plus/shared';
import {
  closeOverRequires,
  type PermissionKey,
} from '@purchasing-plus/shared/permissions';

import type { AppEnv } from '../../config/env.js';
import { seedCatalog } from '../catalog-tree/seed.js';
import { seedSettings } from '../settings/repo.js';

import { writeAudit } from './audit.js';
import { accessTransaction } from './repo.js';
const reports: PermissionKey[] = [
  'reports.requestsOverview',
  'reports.stageTimes',
  'reports.spending',
  'reports.suppliers',
  'reports.priceHistory',
  'reports.unavailable',
  'reports.export',
];
const read: PermissionKey[] = [
  'requests.viewTimeline',
  'requests.viewPrices',
  'requests.viewSupplierNames',
  'catalog.view',
];
const resources = [
  'catalog',
  'catalogTree',
  'attributes',
  'units',
  'suppliers',
  'sites',
] as const;
const views = resources.map((k) => `${k}.view` as const);
const changes: PermissionKey[] = [
  'requests.pause',
  'requests.editWhilePaused',
  'requests.approve',
  'requests.reject',
  'requests.returnForEdit',
  'requests.raiseUrgency',
  'requests.editQuantities',
];
export const seeds: {
  name: string;
  siteScope: 'ASSIGNED' | 'ALL';
  keys: PermissionKey[];
}[] = [
  {
    name: 'مهندس الموقع',
    siteScope: 'ASSIGNED',
    keys: [
      ...read,
      'requests.create',
      'requests.pause',
      'requests.editWhilePaused',
      'receipt.record',
      'items.resolveExternally',
    ],
  },
  {
    name: 'مدير الموقع',
    siteScope: 'ASSIGNED',
    keys: [
      ...read,
      ...changes,
      'pricing.approve',
      'pricing.reject',
      ...reports,
      'records.view',
    ],
  },
  {
    name: 'مسؤول المشتريات',
    siteScope: 'ALL',
    keys: [
      ...read,
      'purchasing.sendRfq',
      'purchasing.price',
      'purchasing.returnForEdit',
      'purchasing.sendSupplyOrder',
      'purchasing.handleRemaining',
      'items.resolveExternally',
      'suppliers.view',
      'records.view',
    ],
  },
  {
    name: 'المحاسب',
    siteScope: 'ALL',
    keys: [
      ...read.filter((k) => k !== 'catalog.view'),
      'pricing.approve',
      ...reports,
      'reports.userActivity',
      'records.view',
    ],
  },
  {
    name: 'صاحب الشركة',
    siteScope: 'ALL',
    keys: [
      ...read,
      ...changes,
      ...views,
      'users.view',
      'roles.view',
      'requests.create',
      'requests.cancelAnyStage',
      'receipt.record',
      'items.resolveExternally',
      'pricing.approve',
      'pricing.reject',
      ...reports,
      'reports.userActivity',
      'records.view',
    ],
  },
  {
    name: 'مدير النظام',
    siteScope: 'ALL',
    keys: [
      'users.view',
      'users.manage',
      'roles.view',
      'roles.manage',
      'settings.manage',
      'data.import',
      'data.export',
      'requests.view',
      'records.view',
      ...resources.flatMap((k) =>
        (['view', 'create', 'edit', 'delete'] as const).map(
          (a) => `${k}.${a}` as const,
        ),
      ),
    ],
  },
];
export async function bootstrap(db: PrismaClient, env: AppEnv) {
  await accessTransaction(db, true, async (tx) => {
    await seedSettings(tx);
    await seedCatalog(tx, env.AUDIT_HMAC_SECRET);
    if (!(await tx.user.count({ where: { isSuperadmin: true } }))) {
      const data = createSupport.parse({
        username: env.SUPERADMIN_USERNAME,
        password: env.SUPERADMIN_PASSWORD,
        name: 'الدعم الفني',
      });
      const user = await tx.user.create({
        data: {
          name: data.name,
          username: data.username,
          isSuperadmin: true,
          passwordHash: await hash(data.password),
        },
      });
      await writeAudit(
        tx,
        env.AUDIT_HMAC_SECRET,
        null,
        null,
        'bootstrap',
        'User',
        user.id,
      );
    }
    if (await tx.role.count()) return;
    for (const { keys, ...data } of seeds) {
      const role = await tx.role.create({
        data: {
          ...data,
          permissions: {
            create: closeOverRequires(keys).map((key) => ({ key })),
          },
        },
      });
      await writeAudit(
        tx,
        env.AUDIT_HMAC_SECRET,
        null,
        null,
        'seed',
        'Role',
        role.id,
        null,
        { ...data, keys: closeOverRequires(keys) },
      );
    }
  });
}
