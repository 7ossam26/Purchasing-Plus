import { admin, ar, supportUi as copy } from '@purchasing-plus/shared/i18n/ar';
import { registry } from '@purchasing-plus/shared/permissions';
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

const grantable = registry
  .filter((entry) => !entry.superadminOnly)
  .map((entry) => entry.key);

function setup(
  path: string,
  respond: (url: URL, options?: RequestInit) => Response,
  isSuperadmin = true,
) {
  const fetch = vi.fn(async (path: string, options?: RequestInit) => {
    const url = new URL(path, 'http://localhost');
    if (url.pathname === '/api/v1/me')
      return Response.json({
        user: { id: 1, name: 'اختبار', username: 'operator' },
        roleName: null,
        isSuperadmin,
        siteScope: 'ALL',
        sites: [],
        permissions: grantable,
      });
    if (url.pathname.startsWith('/api/v1/notifications'))
      return Response.json({ items: [], unread: 0, unreadCount: 0 });
    return respond(url, options);
  });
  vi.stubGlobal('fetch', fetch);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return fetch;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(['/admin/audit', '/admin/maintenance', '/admin/superadmins'])(
  'denies direct navigation to %s for an ordinary account with all grantable keys',
  async (path) => {
    const fetch = setup(path, () => Response.json({}), false);
    await screen.findByRole('heading', { name: ar.errors.denied });
    expect(fetch.mock.calls.some(([url]) => url.includes('/system/'))).toBe(
      false,
    );
  },
);

it('shows the support section and displays filtered audit differences and integrity failures', async () => {
  const row = {
    id: 9,
    createdAt: '2026-11-21T12:00:00Z',
    actorId: 1,
    actorLabel: 'اختبار (الدعم الفني)',
    ip: '127.0.0.1',
    entity: 'Site',
    entityId: '4',
    action: 'site.update',
    oldValue: { name: 'الموقع القديم', isActive: true },
    newValue: { name: 'الموقع الجديد', isActive: true },
    verified: true,
  };
  const requests: URL[] = [];
  setup('/admin/audit', (url) => {
    requests.push(url);
    if (url.pathname.endsWith('/verify'))
      return Response.json({ items: [{ id: row.id, verified: false }] });
    return Response.json({ items: [row], total: 1, page: 1, pageSize: 25 });
  });
  await screen.findByRole('heading', { level: 1, name: copy.audit.title });
  const navigation = screen.getByRole('navigation', {
    name: ar.navigation.admin,
  });
  expect(
    within(navigation).getByRole('heading', { name: ar.auth.support }),
  ).toBeTruthy();
  expect(
    within(navigation).getByRole('link', { name: copy.maintenance }),
  ).toBeTruthy();

  fireEvent.change(screen.getByLabelText(copy.audit.from), {
    target: { value: '2026-11-21' },
  });
  fireEvent.change(screen.getByLabelText(copy.audit.to), {
    target: { value: '2026-11-21' },
  });
  fireEvent.change(screen.getByLabelText(copy.audit.userId), {
    target: { value: '1' },
  });
  fireEvent.change(screen.getByLabelText(copy.audit.entity), {
    target: { value: 'Site' },
  });
  fireEvent.change(screen.getByLabelText(copy.audit.action), {
    target: { value: 'site.update' },
  });
  fireEvent.click(screen.getByRole('button', { name: copy.audit.apply }));
  await waitFor(() =>
    expect(Object.fromEntries(requests.at(-1)!.searchParams)).toEqual({
      page: '1',
      from: '2026-11-20T22:00:00.000Z',
      to: '2026-11-21T21:59:59.999Z',
      userId: '1',
      entity: 'Site',
      action: 'site.update',
    }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: copy.audit.details }),
  );
  const detail = screen.getByRole('dialog', { name: copy.audit.detailTitle });
  expect(within(detail).getByText(copy.audit.before)).toBeTruthy();
  expect(within(detail).getByText(copy.audit.after)).toBeTruthy();
  expect(within(detail).getAllByText(copy.audit.changed)).toHaveLength(1);
  expect(within(detail).getByText('"الموقع القديم"')).toBeTruthy();
  expect(within(detail).getByText('"الموقع الجديد"')).toBeTruthy();
  fireEvent.click(
    within(detail).getByRole('button', { name: ar.common.close }),
  );
  fireEvent.click(screen.getByRole('button', { name: copy.audit.verify }));
  await screen.findByText(copy.audit.mismatch);
  expect(requests.at(-1)?.searchParams.get('ids')).toBe('9');
});

it('requires both confirmation fields and renders progress from a streamed audit check', async () => {
  const verify = copy.actions['verify-audit-log'];
  const inputs: object[] = [];
  const encoder = new TextEncoder();
  let writer: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      writer = controller;
    },
  });
  setup('/admin/maintenance', (url, options) => {
    expect(url.pathname).toBe('/api/v1/system/maintenance/verify-audit-log');
    inputs.push(JSON.parse(options?.body as string));
    return new Response(stream);
  });
  fireEvent.click(await screen.findByRole('button', { name: verify.button }));
  const modal = screen.getByRole('dialog', { name: verify.title });
  const confirm = within(modal).getByRole<HTMLButtonElement>('button', {
    name: ar.common.confirm,
  });
  expect(confirm.disabled).toBe(true);
  fireEvent.change(within(modal).getByLabelText(ar.auth.currentPassword), {
    target: { value: 'test-password' },
  });
  expect(confirm.disabled).toBe(true);
  fireEvent.change(within(modal).getByLabelText(copy.typePhrase), {
    target: { value: verify.phrase },
  });
  expect(confirm.disabled).toBe(false);
  fireEvent.click(confirm);
  writer!.enqueue(encoder.encode('{"checked":0,"total":2,'));
  writer!.enqueue(encoder.encode('"mismatches":0,"done":false}\n'));
  const progress = await screen.findByRole<HTMLProgressElement>('progressbar', {
    name: verify.title,
  });
  expect(progress.value).toBe(0);
  expect(progress.max).toBe(2);
  expect(inputs).toEqual([
    { phrase: verify.phrase, password: 'test-password' },
  ]);
  writer!.enqueue(
    encoder.encode('{"checked":2,"total":2,"mismatches":1,"done":true}\n'),
  );
  writer!.close();
  await screen.findByText(copy.auditResult('1'), { exact: false });
  expect(progress.value).toBe(2);
});

it('lists support accounts, protects the last active one and creates another account', async () => {
  const accounts = [
    { id: 1, name: 'اختبار', username: 'operator', isActive: true },
  ];
  setup('/admin/superadmins', (url, options) => {
    expect(url.pathname).toBe('/api/v1/system/superadmins');
    if (options?.method === 'POST') {
      const { name, username, password } = JSON.parse(options.body as string);
      expect(password).toBe('test-password');
      const account = { id: 2, name, username, isActive: true };
      accounts.push(account);
      return Response.json(account);
    }
    return Response.json({
      items: accounts,
      page: 1,
      pageSize: 25,
      total: accounts.length,
      activeTotal: accounts.length,
    });
  });
  const last = await screen.findByRole<HTMLButtonElement>('button', {
    name: admin.users.deactivate,
  });
  expect(last.disabled).toBe(true);
  expect(screen.getByText(copy.accounts.lastActive)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: copy.accounts.add }));
  const modal = screen.getByRole('dialog', { name: copy.accounts.add });
  fireEvent.change(within(modal).getByLabelText(admin.name), {
    target: { value: 'حساب دعم جديد' },
  });
  fireEvent.change(within(modal).getByLabelText(ar.auth.username), {
    target: { value: 'SECOND' },
  });
  fireEvent.change(within(modal).getByLabelText(ar.auth.newPassword), {
    target: { value: 'test-password' },
  });
  fireEvent.click(
    within(modal).getByRole('button', { name: copy.accounts.add }),
  );
  await screen.findByText('second');
  expect(last.disabled).toBe(false);
});
