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
const modulePages: Partial<Record<string, RouteObject['lazy']>> = {
  users: async () => ({
    Component: (await import('../pages/admin/users.js')).UsersPage,
  }),
  roles: async () => ({
    Component: (await import('../pages/admin/roles.js')).RolesPage,
  }),
  settings: async () => ({
    Component: (await import('../pages/admin/settings.js')).SettingsPage,
  }),
  sites: async () => ({
    Component: (await import('../pages/admin/sites.js')).SitesPage,
  }),
};
const childPages: Partial<Record<string, RouteObject['lazy']>> = {
  'roles/new': async () => ({
    Component: (await import('../pages/admin/role-editor.js')).NewRolePage,
  }),
  'roles/:roleId': async () => ({
    Component: (await import('../pages/admin/role-editor.js')).RoleEditorPage,
  }),
};

function moduleRoutes(): RouteObject[] {
  return modules.map((module) => {
    const shell = module.kind === 'admin' ? <AdminShell /> : <StandardShell />;
    const page = modulePages[module.id];
    return {
      path: module.path,
      element: <ProtectedRoute anyOf={module.anyOf} />,
      children: [
        {
          element: shell,
          children: [
            {
              index: true,
              lazy: page,
              element: page ? undefined : (
                <section>
                  <h1 className="text-title sm:text-title-wide">
                    {module.label}
                  </h1>
                  <EmptyState title={ar.navigation.unavailable} />
                </section>
              ),
            },
          ],
        },
        ...(module.children ?? []).map(({ path, anyOf }) => ({
          path,
          element: <ProtectedRoute anyOf={anyOf} />,
          children: [
            {
              element: shell,
              children: [
                { index: true, lazy: childPages[module.id + '/' + path] },
              ],
            },
          ],
        })),
      ],
    };
  });
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
      ...moduleRoutes(),
      ...(import.meta.env.DEV
        ? [{ path: '/dev/ui', lazy: () => import('../pages/dev-ui.js') }]
        : []),
    ],
  },
];
