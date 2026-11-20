import { defaultSettings } from '@purchasing-plus/shared';
import { admin, ar } from '@purchasing-plus/shared/i18n/ar';
import {
  registry,
  type PermissionKey,
} from '@purchasing-plus/shared/permissions';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '../../app/query.js';
import { routes } from '../../app/routes.js';
import type { SessionProfile } from '../../lib/api/auth.js';
import type { Role } from '../../lib/api/roles.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const page = (items: unknown[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 25,
});
const profile: SessionProfile = {
  user: { id: 10, name: 'حسن', username: 'hassan' },
  roleName: 'حساب تجربة',
  roleId: 8,
  isSuperadmin: false,
  siteScope: 'ALL',
  sites: [],
  permissions: [
    'roles.view',
    'roles.manage',
    'users.view',
    'users.manage',
    'requests.view',
    'requests.create',
    'settings.manage',
  ],
};
function setup(
  url: string,
  handler: (path: string, init?: RequestInit) => Response,
) {
  const fetch = vi.fn(async (path: string, init?: RequestInit) =>
    path === '/api/v1/me' ? Response.json(profile) : handler(path, init),
  );
  vi.stubGlobal('fetch', fetch);
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { fetch, router };
}
function toggle(key: PermissionKey) {
  const permission = registry.find((item) => item.key === key)!;
  return screen.getByRole<HTMLInputElement>('switch', {
    name: new RegExp(permission.label),
  });
}
const editRole = admin.roles;
const users = admin.users;
const settings = admin.settings;

it('ticks required keys, explains why, prevents removal and hides unavailable keys', async () => {
  setup('/admin/roles/new', () => Response.json(page([])));
  await screen.findByRole('heading', { name: editRole.add });
  expect(
    screen.queryByRole('switch', { name: /الموافقة على الطلب/ }),
  ).toBeNull();
  fireEvent.click(toggle('requests.create'));
  expect(toggle('requests.view').checked).toBe(true);
  expect(screen.getByText(/اتفعّل تلقائيًا/).textContent).toContain(
    'إنشاء الطلبات',
  );
  fireEvent.click(toggle('requests.view'));
  expect(toggle('requests.view').checked).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('إنشاء الطلبات');
  fireEvent.click(toggle('requests.create'));
  fireEvent.click(toggle('requests.view'));
  expect(toggle('requests.view').checked).toBe(false);
});

it('copies available permissions, saves the complete role payload and leaves cleanly', async () => {
  const template: Role = {
    id: 3,
    name: 'دور أساسي',
    siteScope: 'ASSIGNED',
    description: '',
    keyCount: 3,
    userCount: 0,
    canEdit: false,
    keys: ['requests.view', 'requests.create', 'pricing.approve'],
  };
  const { router, fetch } = setup('/admin/roles/new', (_path, init) => {
    if (init?.method === 'POST')
      return Response.json({
        ...template,
        id: 42,
        ...JSON.parse(String(init.body)),
      });
    return Response.json(page([template]));
  });
  await screen.findByRole('heading', { name: editRole.add });
  fireEvent.change(screen.getByLabelText(admin.name), {
    target: { value: 'دور جديد' },
  });
  fireEvent.change(screen.getByLabelText(admin.description), {
    target: { value: 'إدارة سجلات الموقع' },
  });
  fireEvent.click(screen.getByRole('radio', { name: /كل المواقع/ }));
  fireEvent.click(screen.getByRole('button', { name: editRole.copy }));
  const dialog = screen.getByRole('dialog', { name: editRole.copy });
  const select = await within(dialog).findByLabelText(admin.role);
  fireEvent.change(select, { target: { value: '3' } });
  fireEvent.click(
    within(dialog).getByRole('button', { name: editRole.copyAction }),
  );
  expect(toggle('requests.create').checked).toBe(true);
  expect(toggle('requests.view').checked).toBe(true);
  expect(screen.getByRole('status').textContent).toBe(editRole.count('2'));
  fireEvent.click(screen.getByRole('button', { name: admin.saveChanges }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/admin/roles'),
  );
  const save = fetch.mock.calls.find(
    ([path, init]) => path === '/api/v1/roles' && init?.method === 'POST',
  );
  expect(JSON.parse(String(save?.[1]?.body))).toEqual({
    name: 'دور جديد',
    description: 'إدارة سجلات الموقع',
    siteScope: 'ALL',
    keys: ['requests.view', 'requests.create'],
  });
});

it('asks before leaving a dirty role', async () => {
  const { router } = setup('/admin/roles/new', () => Response.json(page([])));
  await screen.findByRole('heading', { name: editRole.add });
  fireEvent.change(screen.getByLabelText(admin.name), {
    target: { value: 'تعديل' },
  });
  fireEvent.click(screen.getByRole('link', { name: ar.common.back }));
  const dialog = await screen.findByRole('dialog', { name: ar.dialogs.leave });
  fireEvent.click(
    within(dialog).getByRole('button', { name: ar.common.cancel }),
  );
  expect(router.state.location.pathname).toBe('/admin/roles/new');
  fireEvent.click(screen.getByRole('link', { name: ar.common.back }));
  fireEvent.click(
    await screen.findByRole('button', { name: ar.dialogs.leaveAction }),
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/admin/roles'),
  );
});

it('filters assignable roles, shows sites by scope, validates and shows the server guard fix', async () => {
  const { fetch } = setup('/admin/users', (path, init) => {
    if (path.endsWith('/options'))
      return Response.json({
        roles: [
          { id: 1, name: 'محدد', siteScope: 'ASSIGNED', assignable: true },
          { id: 2, name: 'عام', siteScope: 'ALL', assignable: true },
          { id: 3, name: 'محجوب', siteScope: 'ALL', assignable: false },
        ],
        sites: [{ id: 12, name: 'موقع النخيل', isActive: true }],
      });
    if (init?.method === 'POST')
      return Response.json(
        {
          error: 'FORBIDDEN',
          message: 'نطاق المواقع اتغير',
          fix: 'اختار دور في نطاق صلاحياتك',
        },
        { status: 403 },
      );
    return Response.json(page([]));
  });
  fireEvent.click(await screen.findByRole('button', { name: users.add }));
  const dialog = screen.getByRole('dialog', { name: users.add });
  const form = within(dialog);
  const role = await form.findByLabelText(admin.role);
  expect(form.queryByRole('option', { name: /محجوب/ })).toBeNull();
  expect(
    form.getByRole('option', { name: /محدد.*المواقع المسندة فقط/ }),
  ).toBeTruthy();
  fireEvent.change(role, { target: { value: '1' } });
  expect(form.getByRole('group', { name: admin.sites })).toBeTruthy();
  fireEvent.click(form.getByRole('button', { name: 'موقع النخيل' }));
  fireEvent.change(role, { target: { value: '2' } });
  expect(form.queryByRole('group', { name: admin.sites })).toBeNull();
  fireEvent.click(form.getByRole('button', { name: ar.common.save }));
  expect(form.getByText(admin.validName)).toBeTruthy();
  expect(form.getByText(users.invalidUsername)).toBeTruthy();
  expect(form.getByText(users.invalidPassword)).toBeTruthy();
  fireEvent.change(form.getByLabelText(admin.name), {
    target: { value: 'سارة' },
  });
  fireEvent.change(form.getByLabelText(ar.auth.username), {
    target: { value: 'SARA' },
  });
  fireEvent.change(form.getByLabelText(ar.auth.password), {
    target: { value: 'sample-password' },
  });
  fireEvent.click(form.getByRole('button', { name: ar.common.save }));
  expect((await form.findByRole('alert')).textContent).toContain(
    'اختار دور في نطاق صلاحياتك',
  );
  expect(
    JSON.parse(
      String(
        fetch.mock.calls.find(([, init]) => init?.method === 'POST')?.[1]?.body,
      ),
    ),
  ).toMatchObject({
    username: 'sara',
    roleId: 2,
    siteIds: [],
  });
});

it('renders live template previews and blocks invalid placeholders and aging values', async () => {
  const { fetch } = setup('/admin/settings', (_path, init) =>
    Response.json(
      init?.method === 'PUT' ? JSON.parse(String(init.body)) : defaultSettings,
    ),
  );
  const rfq = await screen.findByLabelText(settings.rfqIntro);
  const days = screen.getByLabelText(settings.agingDays);
  fireEvent.change(rfq, {
    target: { value: '{siteName} — {requestNumber} — {invalid}' },
  });
  const output = screen.getByLabelText(
    settings.rfqIntro + ' — ' + settings.preview,
  );
  expect(output.textContent).toBe('موقع النخيل — PR-0042 — {invalid}');
  fireEvent.change(days, { target: { value: '61' } });
  fireEvent.click(screen.getByRole('button', { name: admin.saveChanges }));
  expect(screen.getByText(settings.invalidTemplate)).toBeTruthy();
  expect(screen.getByText(settings.invalidDays)).toBeTruthy();
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(
    false,
  );
  fireEvent.change(rfq, {
    target: { value: '{categoryName} — {siteAddress}' },
  });
  fireEvent.change(days, { target: { value: '8' } });
  expect(output.textContent).toBe('دهانات — شارع النخيل، القاهرة');
  fireEvent.click(screen.getByRole('button', { name: admin.saveChanges }));
  await screen.findByText(settings.saved);
  const save = fetch.mock.calls.find(([, init]) => init?.method === 'PUT');
  expect(JSON.parse(String(save?.[1]?.body))).toEqual({
    ...defaultSettings,
    rfqIntro: '{categoryName} — {siteAddress}',
    agingDays: 8,
  });
});
