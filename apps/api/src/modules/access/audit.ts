import { createHmac, timingSafeEqual } from 'node:crypto';

import type { Prisma } from '@prisma/client';
type Identity = {
  createdAt: Date;
  action: string;
  entity: string;
  entityId: string | null;
  actorId: number | null;
  actorLabel: string | null;
  ip: string | null;
};
export function redact(value: unknown): Prisma.InputJsonValue | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /password|token|secret|authorization|cookie|api[_-]?key|access[_-]?key|database[_-]?url|session[_-]?id/i.test(
          k,
        )
          ? '[REDACTED]'
          : redact(v),
      ]),
    );
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  )
    return value;
  return String(value);
}
function sign(secret: string, row: Identity) {
  return createHmac('sha256', secret)
    .update(
      JSON.stringify([
        row.createdAt.toISOString(),
        row.action,
        row.entity,
        row.entityId,
        row.actorId,
        row.actorLabel,
        row.ip,
      ]),
    )
    .digest('hex');
}
export function verifyAudit(
  secret: string,
  row: Identity & { signature: string },
) {
  const a = Buffer.from(row.signature),
    b = Buffer.from(sign(secret, row));
  return a.length === b.length && timingSafeEqual(a, b);
}
export type Actor = { id: number; name: string; isSuperadmin: boolean };
export function writeAudit(
  tx: Prisma.TransactionClient,
  secret: string,
  ip: string | null,
  actor: Actor | null,
  action: string,
  entity: string,
  id: number | string | null,
  oldValue?: unknown,
  newValue?: unknown,
) {
  const row = {
    createdAt: new Date(),
    action,
    entity,
    entityId: id === null ? null : String(id),
    actorId: actor?.id ?? null,
    actorLabel: actor
      ? actor.name + (actor.isSuperadmin ? ' (الدعم الفني)' : '')
      : null,
    ip,
  };
  return tx.auditLog.create({
    data: {
      ...row,
      signature: sign(secret, row),
      oldValue: redact(oldValue) ?? undefined,
      newValue: redact(newValue) ?? undefined,
    },
  });
}
