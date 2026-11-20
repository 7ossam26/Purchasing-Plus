import { ar } from '@purchasing-plus/shared/i18n/ar';

import { Button } from '../components/ui/button.js';
import { Skeleton } from '../components/ui/states.js';
import { ApiError } from '../lib/api/client.js';

import { useSession } from './session.js';

export function SessionState() {
  const { error, reload } = useSession();
  if (error)
    return (
      <div className="grid gap-2">
        <h1 className="text-title">{ar.errors.session}</h1>
        <p role="alert" className="text-danger-fg">
          {error instanceof ApiError ? error.message : ar.common.fallbackError}
        </p>
        {error instanceof ApiError && error.fix && (
          <p className="text-small text-concrete">{error.fix}</p>
        )}
        <Button className="justify-self-start" onClick={reload}>
          {ar.common.retry}
        </Button>
      </div>
    );
  return <SessionLoading />;
}

export function SessionLoading() {
  return (
    <div role="status" aria-label={ar.common.loading} className="grid gap-4">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}
