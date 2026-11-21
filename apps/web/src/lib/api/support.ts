import {
  cairoDateBoundary,
  type AuditProgress,
  type createSupport,
  type MaintenanceAction,
  type MaintenanceConfirmation,
} from '@purchasing-plus/shared';
import { supportUi } from '@purchasing-plus/shared/i18n/ar';

import { api, apiResponse, ApiError } from './client.js';
import { recordPath, type RecordPage } from './records.js';
import type { User } from './users.js';

type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export interface AuditRow {
  id: number;
  createdAt: string;
  actorId: number | null;
  actorLabel: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  oldValue: JsonValue;
  newValue: JsonValue;
  verified: boolean;
}
export type AuditFilters = Record<
  'from' | 'to' | 'userId' | 'entity' | 'action',
  string
>;

const auditPath = '/system/audit-log';
const accountPath = '/system/superadmins';

export const supportApi = {
  audit: (page: number, filters: AuditFilters, signal: AbortSignal) =>
    api<RecordPage<AuditRow>>(
      recordPath(auditPath, {
        ...filters,
        page,
        from: filters.from
          ? cairoDateBoundary(filters.from).toISOString()
          : undefined,
        to: filters.to
          ? new Date(+cairoDateBoundary(filters.to, true) - 1).toISOString()
          : undefined,
      }),
      { signal },
    ),
  verifyPage: (ids: number[]) =>
    api<{ items: Pick<AuditRow, 'id' | 'verified'>[] }>(
      recordPath(auditPath + '/verify', { ids: ids.join(',') }),
    ),
  accounts: (page: number, signal: AbortSignal) =>
    api<RecordPage<User> & { activeTotal: number }>(
      recordPath(accountPath, { page }),
      { signal },
    ),
  create: (body: ReturnType<typeof createSupport.parse>) =>
    api<User>(accountPath, { method: 'POST', body }),
  deactivate: (id: number) =>
    api<User>(accountPath + '/' + id, {
      method: 'PATCH',
      body: { isActive: false },
    }),
  resetPassword: (id: number, password: string) =>
    api<void>(accountPath + '/' + id + '/reset-password', {
      method: 'POST',
      body: { password },
    }),
  maintain: async (
    action: MaintenanceAction,
    body: MaintenanceConfirmation,
    signal: AbortSignal,
    onProgress: (progress: AuditProgress) => void,
  ) => {
    const path = '/system/maintenance/' + action;
    if (action !== 'verify-audit-log') {
      await api(path, { method: 'POST', body, signal });
      return;
    }

    const response = await apiResponse(
      path,
      { method: 'POST', body, signal },
      'application/x-ndjson',
    );
    const reader = response.body
      ?.pipeThrough(new TextDecoderStream())
      .getReader();
    try {
      let pending = '';
      while (reader) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const lines = (pending + chunk.value).split('\n');
        pending = lines.pop()!;
        for (const line of lines) {
          const progress = JSON.parse(line) as AuditProgress;
          onProgress(progress);
          if (progress.done) return;
        }
      }
    } catch (error) {
      if (signal.aborted) throw error;
    } finally {
      await reader?.cancel().catch(() => undefined);
    }
    throw new ApiError(
      0,
      'INCOMPLETE_VERIFICATION',
      supportUi.interrupted,
      supportUi.interruptedFix,
    );
  },
};
