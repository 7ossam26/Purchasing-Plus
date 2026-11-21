import { ar } from '@purchasing-plus/shared/i18n/ar';
import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { ApiError } from '../../lib/api/client.js';
import type { BatchResult } from '../../lib/api/purchasing.js';
import { requestKey, type RequestDto } from '../../lib/api/requests.js';

import { useRequestUpdates } from './workspace.js';

type Result = RequestDto | BatchResult;
export type PurchaseWrite = <T extends Result>(
  save: (version: number) => Promise<T>,
) => Promise<T>;

// Multiple line timers and RFQ actions share the request version.
export function usePurchaseWrites(request: RequestDto): PurchaseWrite {
  const client = useQueryClient();
  const updates = useRequestUpdates(request.id);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const generation = useRef(0);
  return (save) => {
    const stamp = generation.current;
    const pending = queue.current.then(async () => {
      if (stamp !== generation.current)
        throw new ApiError(
          409,
          'VERSION_CONFLICT',
          ar.lifecycle.errors.VERSION_CONFLICT,
        );
      await client.cancelQueries({ queryKey: requestKey(request.id) });
      const base =
        client.getQueryData<RequestDto>(requestKey(request.id)) ?? request;
      try {
        const result = await save(base.version);
        await updates.update(
          'batch' in result ? { ...base, version: result.version } : result,
        );
        return result;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409)
          generation.current++;
        await updates.fail(error);
        throw error;
      }
    });
    queue.current = pending.catch(() => undefined);
    return pending;
  };
}
