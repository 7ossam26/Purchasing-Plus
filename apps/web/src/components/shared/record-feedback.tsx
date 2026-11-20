import { ar } from '@purchasing-plus/shared/i18n/ar';
import type { ReactNode } from 'react';

import { ApiError } from '../../lib/api/client.js';
import { Button } from '../ui/button.js';
import { Skeleton } from '../ui/states.js';

export function errorDetails(error: Error) {
  return error instanceof ApiError
    ? error
    : { message: ar.common.fallbackError };
}

export function InlineError({
  error,
  retry,
}: {
  error: Error | null;
  retry?: () => void;
}) {
  if (!error) return null;
  const details = errorDetails(error);
  return (
    <div
      role="alert"
      className="grid gap-2 rounded-control bg-danger-bg p-3 text-small text-danger-fg"
    >
      <p>{details.message}</p>
      {'fix' in details && details.fix && <p>{details.fix}</p>}
      {retry && (
        <Button
          className="justify-self-start"
          variant="secondary"
          onClick={retry}
        >
          {ar.common.retry}
        </Button>
      )}
    </div>
  );
}

export function LoadRecord<T>({
  query,
  children,
}: {
  query: { data: T | undefined; error: Error | null; refetch: () => unknown };
  children: (data: T) => ReactNode;
}) {
  if (query.error)
    return (
      <InlineError error={query.error} retry={() => void query.refetch()} />
    );
  if (query.data === undefined) {
    return (
      <div role="status" aria-label={ar.common.loading}>
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  return children(query.data);
}
