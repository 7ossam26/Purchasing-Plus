import { verify } from '@node-rs/argon2';
import type {
  AuditProgress,
  MaintenanceAction,
  MaintenanceConfirmation,
} from '@purchasing-plus/shared';
import { supportUi } from '@purchasing-plus/shared/i18n/ar';

import { AppError } from '../../middleware/errors.js';
import { verifyAudit } from '../access/audit.js';
import type { Context } from '../access/endpoint.js';
import { auditBatch, auditSnapshot, type AuditReader } from '../access/repo.js';
import { rebuildSearchText } from '../catalog/repo.js';
import { purgeNotifications } from '../events/repo.js';

import { resetOperationalData, supportPassword } from './repo.js';

export async function runMaintenance(
  { tx, viewer, now, audit }: Context,
  action: MaintenanceAction,
  { phrase, password }: MaintenanceConfirmation,
) {
  if (phrase !== supportUi.actions[action].phrase)
    throw new AppError(
      422,
      'INCORRECT_CONFIRMATION',
      supportUi.incorrectPhrase,
    );
  if (!(await verify(await supportPassword(tx, viewer.userId), password)))
    throw new AppError(403, 'INCORRECT_PASSWORD', supportUi.incorrectPassword);

  if (action === 'verify-audit-log') {
    const snapshot = await auditSnapshot(tx);
    await audit('maintenance.' + action, 'System', null, null, snapshot);
    return { snapshot };
  }

  let result: { count?: number; updated?: number } = {};
  if (action === 'purge-notifications')
    result = await purgeNotifications(tx, now);
  if (action === 'rebuild-catalog-search') result = await rebuildSearchText(tx);
  if (action === 'reset-operational-data') await resetOperationalData(tx);
  await audit('maintenance.' + action, 'System', null, null, result);
  return { result };
}

export async function* auditProgress(
  db: AuditReader,
  { lastId, total }: Awaited<ReturnType<typeof auditSnapshot>>,
  secret: string,
): AsyncGenerator<AuditProgress> {
  let after = 0;
  let checked = 0;
  let mismatches = 0;
  yield { checked, total, mismatches, done: false };
  while (after < lastId) {
    const rows = await auditBatch(db, after, lastId);
    const last = rows.at(-1);
    if (!last) break;
    after = last.id;
    checked += rows.length;
    mismatches += rows.filter((row) => !verifyAudit(secret, row)).length;
    yield { checked, total, mismatches, done: false };
  }
  if (checked !== total)
    throw new Error('Audit snapshot changed during verification');
  yield { checked, total, mismatches, done: true };
}
