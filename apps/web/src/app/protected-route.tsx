import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';

import { SystemPage } from '../pages/system.js';

import { loginPath } from './navigation.js';
import { SessionState } from './session-state.js';
import { useCanAny, useSession } from './session.js';
import { BareShell } from './shells/bare.js';

export function ProtectedRoute({
  anyOf = [],
  children,
}: {
  anyOf?: readonly PermissionKey[];
  children?: ReactNode;
}) {
  const location = useLocation();
  const { profile } = useSession();
  const allowed = useCanAny(anyOf);
  if (profile === undefined)
    return (
      <BareShell>
        <SessionState />
      </BareShell>
    );
  if (!profile)
    return (
      <Navigate
        replace
        to={loginPath(location.pathname + location.search + location.hash)}
      />
    );
  if (!allowed)
    return (
      <BareShell>
        <SystemPage type="denied" />
      </BareShell>
    );
  return children ?? <Outlet />;
}
