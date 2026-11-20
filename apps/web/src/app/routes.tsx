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
  masterData: async () => ({
    Component: (await import('../pages/master-data/hub.js')).MasterDataPage,
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

function catalogRoute(
  path: string,
  anyOf: (typeof modules)[number]['anyOf'],
): RouteObject {
  return {
    element: <ProtectedRoute anyOf={anyOf} />,
    children: [
      {
        path,
        element: <StandardShell />,
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import('../pages/master-data/catalog.js'))
                .CatalogPage,
            }),
          },
          {
            path: 'node/:nodeId',
            lazy: async () => ({
              Component: (await import('../pages/master-data/catalog.js'))
                .CatalogPage,
            }),
            children: [
              {
                path: 'new',
                element: <ProtectedRoute anyOf={['catalog.create']} />,
                children: [
                  {
                    index: true,
                    lazy: async () => ({
                      Component: (
                        await import('../pages/master-data/catalog.js')
                      ).NewItemPage,
                    }),
                  },
                ],
              },
            ],
          },
          {
            path: 'item/:itemId',
            lazy: async () => ({
              Component: (await import('../pages/master-data/catalog.js'))
                .ItemPage,
            }),
            children: [
              {
                path: 'edit',
                element: <ProtectedRoute anyOf={['catalog.edit']} />,
                children: [
                  {
                    index: true,
                    lazy: async () => ({
                      Component: (
                        await import('../pages/master-data/catalog.js')
                      ).EditItemPage,
                    }),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function moduleRoutes(): RouteObject[] {
  return modules.map((module) => {
    if (module.id === 'catalog') return catalogRoute(module.path, module.anyOf);
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
const masterDataRoutes: RouteObject[] = [
  {
    element: <ProtectedRoute anyOf={['masterData.view']} />,
    children: [
      {
        element: <StandardShell />,
        children: [
          {
            path: '/master-data/tree',
            element: <ProtectedRoute anyOf={['catalogTree.view']} />,
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import('../pages/master-data/tree.js'))
                    .TreePage,
                }),
              },
            ],
          },
          {
            path: '/master-data/attributes',
            element: <ProtectedRoute anyOf={['attributes.view']} />,
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (
                    await import('../pages/master-data/attributes.js')
                  ).AttributesPage,
                }),
              },
            ],
          },
          {
            path: '/master-data/units',
            element: <ProtectedRoute anyOf={['units.view']} />,
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import('../pages/master-data/units.js'))
                    .UnitsPage,
                }),
              },
            ],
          },
          {
            path: '/master-data/suppliers',
            element: <ProtectedRoute anyOf={['suppliers.view']} />,
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import('../pages/master-data/suppliers.js'))
                    .SuppliersPage,
                }),
              },
            ],
          },
        ],
      },
    ],
  },
];
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
      ...masterDataRoutes,
      ...(import.meta.env.DEV
        ? [{ path: '/dev/ui', lazy: () => import('../pages/dev-ui.js') }]
        : []),
    ],
  },
];
