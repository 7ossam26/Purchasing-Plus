import { ar } from '@purchasing-plus/shared/i18n/ar';
import {
  registry,
  type PermissionKey,
} from '@purchasing-plus/shared/permissions';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router';

import { authApi, type SessionProfile } from '../lib/api/auth.js';
import { ApiError } from '../lib/api/client.js';

const refreshInterval = 10_000;
const sessionQuery = queryOptions({
  queryKey: ['session', 'me'] as const,
  queryFn: ({ signal }) => authApi.me(signal),
  staleTime: refreshInterval,
  refetchOnReconnect: false,
});
interface Session {
  profile: SessionProfile | null | undefined;
  error: Error | null;
  reload: () => void;
  login: (credentials: { username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (input: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
}
const SessionContext = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const location = useLocation();
  const query = useQuery(sessionQuery);
  useEffect(() => {
    const state = client.getQueryState(sessionQuery.queryKey);
    const lastChecked = Math.max(
      state?.dataUpdatedAt ?? 0,
      state?.errorUpdatedAt ?? 0,
    );
    if (Date.now() - lastChecked >= refreshInterval)
      void client.fetchQuery(sessionQuery).catch(() => undefined);
  }, [client, location.key]);

  async function clearSession() {
    await client.cancelQueries();
    client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
    client.setQueryData(sessionQuery.queryKey, null);
  }

  return (
    <SessionContext.Provider
      value={{
        profile: query.data,
        error: query.error,
        reload: () => void query.refetch(),
        async login(credentials) {
          await authApi.login(credentials);
          await clearSession();
          const profile = await client.fetchQuery({
            ...sessionQuery,
            staleTime: 0,
          });
          if (!profile)
            throw new ApiError(
              401,
              'SESSION_REQUIRED',
              ar.auth.sessionRequired,
            );
        },
        async logout() {
          try {
            await authApi.logout();
          } catch (error) {
            if (!(error instanceof ApiError && error.status === 401))
              throw error;
          }
          await clearSession();
        },
        async changePassword(input) {
          await authApi.changePassword(input);
          await clearSession();
        },
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider is required');
  return session;
}
export function can(
  profile: SessionProfile | null | undefined,
  key: PermissionKey,
) {
  return Boolean(
    profile?.isSuperadmin ||
    (!registry.find((permission) => permission.key === key)?.superadminOnly &&
      profile?.permissions.includes(key)),
  );
}
export function useCan(key: PermissionKey) {
  return can(useSession().profile, key);
}
export function useCanOnSite(key: PermissionKey, siteId: number) {
  const { profile } = useSession();
  return (
    can(profile, key) &&
    Boolean(
      profile?.isSuperadmin ||
      profile?.siteScope === 'ALL' ||
      profile?.sites.some((site) => site.id === siteId),
    )
  );
}
export function useCanAny(keys: readonly PermissionKey[]) {
  const { profile } = useSession();
  return keys.length === 0 || keys.some((key) => can(profile, key));
}
