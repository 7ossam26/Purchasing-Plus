import type { PrismaClient } from '@prisma/client';
import {
  defaultSettings,
  previousSupplyOrderIntros,
} from '@purchasing-plus/shared';
import type { RefusalCode } from '@purchasing-plus/shared/lifecycle';
import { retiredPermissionKeys } from '@purchasing-plus/shared/permissions';

import { writeAudit } from '../access/audit.js';
import { accessTransaction, type Tx } from '../access/repo.js';
import type { EventBus, LiveSignal } from '../events/bus.js';
import { pendingApprovalIds } from '../requests/repo.js';
import { runSystemTransition } from '../requests/service.js';
import { removeRoleKeys, rolesHoldingKeys } from '../roles/repo.js';
import { replaceDefaultSupplyOrderIntro } from '../settings/repo.js';

import { retireApprovalNotifications } from './repo.js';

export type DirectReceiptMigration = {
  released: number[];
  skipped: { requestId: number; code: RefusalCode | 'NOT_FOUND' }[];
  notificationsRetired: number;
  rolesUpdated: number[];
  supplyOrderIntroUpdated: boolean;
};

// A short log line for startup and the command. Empty when there was nothing left to migrate.
export function describeMigration(result: DirectReceiptMigration) {
  const parts = [
    result.released.length &&
      `released ${result.released.length} request(s) to receipt`,
    result.skipped.length &&
      `skipped ${result.skipped
        .map((s) => `#${s.requestId} (${s.code})`)
        .join(', ')}`,
    result.notificationsRetired &&
      `marked ${result.notificationsRetired} approval notification(s) read`,
    result.rolesUpdated.length &&
      `removed approval keys from ${result.rolesUpdated.length} role(s)`,
    result.supplyOrderIntroUpdated &&
      'updated the default supply-order message',
  ].filter(Boolean);
  return parts.length ? `Direct-receipt migration: ${parts.join('; ')}.\n` : '';
}

function auditor(tx: Tx, secret: string) {
  return (
    action: string,
    entity: string,
    id: number | null,
    oldValue?: unknown,
    newValue?: unknown,
  ) =>
    writeAudit(tx, secret, null, null, action, entity, id, oldValue, newValue);
}

// One-time move to the direct-receipt workflow, run at every startup and by the
// `migrate:direct-receipt` command. Each step only touches what is still left over from the
// removed pricing approval, so a rerun finds nothing and writes nothing:
// 1. Each request still waiting for approval is released to receipt by the shared lifecycle's
//    system transition, in its own transaction with its supply orders, catalog prices,
//    timeline event, notifications and audit row. Live signals publish after that commit.
// 2. Unread notifications that asked for the removed approval are marked read.
// 3. Roles drop the retired approval keys, with a signed audit row each. No duty replaces them.
// 4. A supply-order template still holding the former default («تم اعتماد طلب») takes the new
//    default («تم إصدار أمر توريد»). Custom templates and messages already written are kept.
export async function migrateToDirectReceipt(
  db: PrismaClient,
  options: { auditSecret: string; clock?: () => Date; eventBus?: EventBus },
): Promise<DirectReceiptMigration> {
  const clock = options.clock ?? (() => new Date());
  const outcome: DirectReceiptMigration = {
    released: [],
    skipped: [],
    notificationsRetired: 0,
    rolesUpdated: [],
    supplyOrderIntroUpdated: false,
  };
  const publish = (signals: LiveSignal[]) => {
    for (const signal of signals) options.eventBus?.publish(signal);
  };
  for (const requestId of await pendingApprovalIds(db)) {
    const signals: LiveSignal[] = [];
    const result = await db.$transaction(
      (tx) =>
        runSystemTransition(
          {
            tx,
            now: clock(),
            audit: auditor(tx, options.auditSecret),
            signals,
          },
          requestId,
          'releasePendingPricing',
          {},
        ),
      { timeout: 15000 },
    );
    if (result.ok) {
      outcome.released.push(requestId);
      publish(signals);
    } else outcome.skipped.push({ requestId, code: result.code });
  }
  const retired = await db.$transaction(async (tx) => {
    const rows = await retireApprovalNotifications(tx, clock());
    if (rows.length)
      await auditor(tx, options.auditSecret)(
        'notification.retireApprovalRequests',
        'Notification',
        null,
        null,
        { count: rows.length },
      );
    return rows;
  });
  outcome.notificationsRetired = retired.length;
  publish(
    [...new Set(retired.map((row) => row.userId))].map((userId) => ({
      type: 'notifications.read' as const,
      userId,
    })),
  );
  outcome.rolesUpdated = await accessTransaction(db, true, async (tx) => {
    const updated: number[] = [];
    const keys = (role: { permissions: { key: string }[] }) => ({
      keys: role.permissions.map((p) => p.key).sort(),
    });
    for (const role of await rolesHoldingKeys(tx, retiredPermissionKeys)) {
      const after = await removeRoleKeys(tx, role, retiredPermissionKeys);
      await auditor(tx, options.auditSecret)(
        'role.retireKeys',
        'Role',
        role.id,
        keys(role),
        keys(after),
      );
      updated.push(role.id);
    }
    return updated;
  });
  outcome.supplyOrderIntroUpdated = await accessTransaction(
    db,
    true,
    async (tx) => {
      const change = await replaceDefaultSupplyOrderIntro(
        tx,
        previousSupplyOrderIntros,
        defaultSettings.supplyOrderIntro,
      );
      if (change)
        await auditor(tx, options.auditSecret)(
          'settings.update',
          'Settings',
          null,
          change.before,
          change.after,
        );
      return change !== null;
    },
  );
  return outcome;
}
