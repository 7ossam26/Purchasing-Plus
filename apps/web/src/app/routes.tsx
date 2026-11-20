import { ar } from '@purchasing-plus/shared/i18n/ar';
import { modules } from '@purchasing-plus/shared/permissions';
import { Outlet, type RouteObject } from 'react-router';

import { DialogProvider } from '../components/ui/dialogs.js';
import { EmptyState } from '../components/ui/states.js';
import { Toast } from '../components/ui/toast.js';
import { HomePage } from '../pages/home.js';
import { LoginPage } from '../pages/login.js';
import { SystemPage } from '../pages/system.js';

import { ProtectedRoute } from './protected-route.js';
import { SessionLoading } from './session-state.js';
import { SessionProvider } from './session.js';
import { AdminShell } from './shells/admin.js';
import { BareShell } from './shells/bare.js';
import { StandardShell } from './shells/standard.js';

export function AppProviders() {
  return (
    <SessionProvider>
      <DialogProvider>
        <Outlet />
        <Toast />
      </DialogProvider>
    </SessionProvider>
  );
}
function moduleRoutes(kind: 'admin' | 'other'): RouteObject[] {
  return modules
    .filter((module) =>
      kind === 'admin' ? module.kind === 'admin' : module.kind !== 'admin',
    )
    .map((module) => ({
      path: module.path,
      element: <ProtectedRoute anyOf={module.anyOf} />,
      children: [
        {
          index: true,
          element: (
            <section>
              <h1 className="text-title sm:text-title-wide">{module.label}</h1>
              <EmptyState title={ar.navigation.unavailable} />
            </section>
          ),
        },
      ],
    }));
}
export const routes: RouteObject[] = [
  {
    element: <AppProviders />,
    hydrateFallbackElement: (
      <BareShell>
        <SessionLoading />
      </BareShell>
    ),
    errorElement: (
      <BareShell>
        <SystemPage type="unexpected" />
      </BareShell>
    ),
    children: [
      {
        element: <BareShell />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '*', element: <SystemPage type="notFound" /> },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <StandardShell />,
            children: [{ index: true, element: <HomePage /> }],
          },
        ],
      },
      ...(['admin', 'other'] as const).flatMap((kind) =>
        moduleRoutes(kind).map((route) => {
          // Permission gates sit outside the shell so denial only renders the bare page.
          return {
            path: route.path,
            element: route.element,
            children: [
              {
                element: kind === 'admin' ? <AdminShell /> : <StandardShell />,
                children: route.children,
              },
            ],
          };
        }),
      ),
      ...(import.meta.env.DEV
        ? [{ path: '/dev/ui', lazy: () => import('../pages/dev-ui.js') }]
        : []),
    ],
  },
];
