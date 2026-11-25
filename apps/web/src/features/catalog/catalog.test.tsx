import { formatMoney } from '@purchasing-plus/shared';
import {
  admin,
  ar,
  catalogImages as imageCopy,
  masterData as copy,
} from '@purchasing-plus/shared/i18n/ar';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { createQueryClient } from '../../app/query.js';
import { AppProviders, routes } from '../../app/routes.js';
import type { SessionProfile } from '../../lib/api/auth.js';
import type {
  Attribute,
  CatalogImage,
  CatalogItem,
  Folder,
} from '../../lib/api/catalog.js';

import { Explorer } from './Explorer.js';

const catalogRead: PermissionKey[] = ['masterData.view', 'catalog.view'];
const category: Folder = {
  id: 1,
  parentId: null,
  codePrefix: 'ELC',
  name: 'كهربا',
  iconKey: 'zap',
  path: '/1/',
  isActive: true,
  childGroupCount: 1,
  subtreeItemCount: 1,
  coverThumbs: [],
};
const group: Folder = {
  ...category,
  id: 2,
  parentId: 1,
  name: 'كابلات',
  path: '/1/2/',
  codePrefix: null,
  iconKey: null,
  childGroupCount: 0,
};
const secondCategory = { ...category, id: 3, name: 'صحي', path: '/3/' };
const piece = { id: 10, name: 'قطعة', isActive: true };
const gauge: Attribute = {
  id: 31,
  name: 'السُمك',
  unitLabel: 'مم',
  isActive: true,
  options: [],
  type: 'NUMBER',
};
const color: Attribute = {
  id: 32,
  name: 'اللون',
  unitLabel: null,
  isActive: true,
  type: 'SELECT',
  options: [{ id: 4, label: 'أبيض', isActive: true }],
};
const material: Attribute = {
  id: 33,
  name: 'الخامة',
  unitLabel: null,
  isActive: true,
  type: 'TEXT',
  options: [],
};
const item: CatalogItem = {
  id: 11,
  name: 'سلك معزول',
  code: 'ELC-0011',
  nodeId: 2,
  nodePath: [category, group],
  unitId: piece.id,
  unit: piece,
  description: '',
  isActive: true,
  attributeValues: [],
};
const catalogPhoto: CatalogImage = {
  id: 1,
  width: 900,
  height: 600,
  order: 0,
  isCover: true,
  thumbUrl: '/media/thumb',
  displayUrl: '/media/full',
  crop: null,
};

async function loadCropPreview(dialog: HTMLElement) {
  await waitFor(() => expect(dialog.querySelector('img')).not.toBeNull());
  const photo = dialog.querySelector('img')!;
  Object.defineProperties(photo, {
    naturalWidth: { value: 900 },
    naturalHeight: { value: 600 },
  });
  fireEvent.load(photo);
  return within(dialog).getByRole('group', { name: imageCopy.cropArea });
}
const page = <Row,>(items: Row[]) => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
});
const profile: SessionProfile = {
  user: { id: 9, name: 'حسن', username: 'hassan' },
  roleName: 'حساب تجربة',
  roleId: 10,
  isSuperadmin: false,
  siteScope: 'ALL',
  sites: [],
  permissions: [],
};

function fixtures(path: string, init?: RequestInit): Response {
  switch (path) {
    case '/catalog/categories':
    case '/catalog-tree/categories':
      return Response.json([category, secondCategory]);
    case '/catalog/nodes/1':
      return Response.json({ ...category, breadcrumb: [category] });
    case '/catalog/nodes/2':
      return Response.json({ ...group, breadcrumb: [category, group] });
    case '/catalog/nodes/1/children':
    case '/catalog-tree/nodes/1/children':
      return Response.json([group]);
    case '/catalog/nodes/2/children':
      return Response.json([]);
    case '/catalog/nodes/1/items':
      return Response.json(page([]));
    case '/catalog/nodes/2/items':
    case '/catalog/search':
      return Response.json(page([item]));
    case '/catalog/items/11':
      return Response.json(item);
    case '/catalog/nodes/2/editor-choices':
      return Response.json({
        defaults: [gauge, material],
        units: page([piece]),
        attributes: page([gauge, color, material]),
      });
    case '/catalog/items':
      if (init?.method === 'POST')
        return Response.json(
          { ...item, ...JSON.parse(String(init.body)) },
          { status: 201 },
        );
      break;
  }
  return Response.json(
    { error: 'MISSING', message: ar.errors.notFound },
    { status: 404 },
  );
}

function setup(
  path: string,
  permissions: PermissionKey[],
  handler = fixtures,
  custom?: ReturnType<typeof createMemoryRouter>,
) {
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    const endpoint = url.pathname.replace(/^\/api\/v1/, '');
    return endpoint === '/me'
      ? Response.json({ ...profile, permissions })
      : handler(endpoint, init);
  });
  vi.stubGlobal('fetch', fetch);
  const router =
    custom ?? createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, fetch };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('edits the framing of an existing photo without changing its full image', async () => {
  let current = { ...item, images: [catalogPhoto] };
  const recordCrop = vi.fn();
  setup(
    '/catalog/item/11/edit',
    [...catalogRead, 'catalog.edit'],
    (path, init) => {
      if (
        path === '/catalog/items/11/images/1/crop' &&
        init?.method === 'PATCH'
      ) {
        const { crop } = JSON.parse(String(init.body));
        recordCrop(crop);
        current = { ...current, images: [{ ...catalogPhoto, crop }] };
        return Response.json(current.images);
      }
      return path === '/catalog/items/11'
        ? Response.json(current)
        : fixtures(path, init);
    },
  );
  fireEvent.click(
    await screen.findByRole('button', { name: imageCopy.editCrop }),
  );
  const dialog = screen.getByRole('dialog', { name: imageCopy.cropTitle });
  const frame = await loadCropPreview(dialog);
  fireEvent.keyDown(frame, { key: 'ArrowLeft' });
  fireEvent.click(
    within(dialog).getByRole('button', { name: imageCopy.cropSave }),
  );
  await waitFor(() => expect(dialog.isConnected).toBe(false));
  expect(recordCrop).toHaveBeenCalledWith({ x: 165, y: 0, size: 600 });
  expect(screen.getByRole('img', { name: item.name }).getAttribute('src')).toBe(
    catalogPhoto.displayUrl,
  );

  fireEvent.click(screen.getByRole('button', { name: imageCopy.editCrop }));
  const reopened = screen.getByRole('dialog', { name: imageCopy.cropTitle });
  await loadCropPreview(reopened);
  fireEvent.change(within(reopened).getByRole('slider'), {
    target: { value: '40' },
  });
  fireEvent.click(
    within(reopened).getByRole('button', { name: imageCopy.cropReset }),
  );
  fireEvent.click(
    within(reopened).getByRole('button', { name: imageCopy.cropSave }),
  );
  await waitFor(() => expect(reopened.isConnected).toBe(false));
  expect(recordCrop).toHaveBeenLastCalledWith(null);
  expect(
    window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
  ).toBe(true);
});

it('previews uploads in order, skips the first file, and sends only the approved crop', async () => {
  const previews = vi.fn();
  const uploads = vi.fn();
  const originalUrl = URL;
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends originalUrl {
      static createObjectURL = () => 'blob:crop-preview';
      static revokeObjectURL = revoke;
    },
  );
  vi.stubGlobal(
    'XMLHttpRequest',
    class {
      upload = {};
      status = 201;
      response = [catalogPhoto];
      onload?: () => void;
      open() {}
      send(body: FormData) {
        uploads(body);
        this.onload?.();
      }
    },
  );
  setup(
    '/catalog/item/11/edit',
    [...catalogRead, 'catalog.edit'],
    (path, init) => {
      if (
        path === '/catalog/items/11/images/preview' &&
        init?.method === 'POST'
      ) {
        previews((init.body as FormData).get('file'));
        return new Response('preview', {
          headers: { 'Content-Type': 'image/webp' },
        });
      }
      return fixtures(path, init);
    },
  );
  const first = new File(['first'], 'first.heic');
  const second = new File(['second'], 'second.png');
  const input = await screen.findByLabelText(imageCopy.add);
  fireEvent.change(input, { target: { files: [first, second] } });
  const firstDialog = screen.getByRole('dialog', { name: imageCopy.cropTitle });
  await loadCropPreview(firstDialog);
  fireEvent.click(
    within(firstDialog).getByRole('button', { name: imageCopy.cropSkip }),
  );
  expect(uploads).not.toHaveBeenCalled();
  const secondDialog = screen.getByRole('dialog', {
    name: imageCopy.cropTitle,
  });
  const frame = await loadCropPreview(secondDialog);
  fireEvent.keyDown(frame, { key: 'ArrowRight' });
  fireEvent.click(
    within(secondDialog).getByRole('button', { name: imageCopy.cropUpload }),
  );
  await waitFor(() => expect(secondDialog.isConnected).toBe(false));
  expect(previews.mock.calls.map(([file]) => file.name)).toEqual([
    'first.heic',
    'second.png',
  ]);
  expect(uploads).toHaveBeenCalledTimes(1);
  const body = uploads.mock.calls[0]![0] as FormData;
  expect((body.get('file') as File).name).toBe('second.png');
  expect(JSON.parse(String(body.get('crop')))).toEqual({
    x: 135,
    y: 0,
    size: 600,
  });
  expect(revoke).toHaveBeenCalledTimes(2);
});

it('shows only the master-data destinations the viewer can open', async () => {
  setup('/master-data', ['masterData.view', 'catalog.view', 'sites.view']);
  await screen.findByRole('heading', { name: copy.hub });
  expect(
    screen
      .getByRole('link', { name: new RegExp(copy.items) })
      .getAttribute('href'),
  ).toBe('/catalog');
  expect(
    screen
      .getByRole('link', { name: new RegExp(admin.sites) })
      .getAttribute('href'),
  ).toBe('/master-data/sites');
  expect(
    screen.queryByRole('link', { name: new RegExp(copy.tree) }),
  ).toBeNull();
  expect(
    screen.queryByRole('link', { name: new RegExp(copy.suppliers) }),
  ).toBeNull();
});

it('renders item details and shows the price slot only with the price grant', async () => {
  setup('/catalog/item/11', catalogRead);
  await screen.findByRole('heading', { name: item.name });
  expect(screen.getByText(item.code)).toBeDefined();
  expect(screen.getByRole('link', { name: 'كهربا / كابلات' })).toBeDefined();
  expect(screen.queryByText(copy.latestPrice)).toBeNull();
  cleanup();
  setup('/catalog/item/11', [...catalogRead, 'requests.viewPrices']);
  expect(await screen.findByText(copy.latestPrice)).toBeDefined();
  expect(screen.getByText(copy.dash)).toBeDefined();
});

it('displays a populated latest price on catalog details and folder swatches', async () => {
  const priced = {
    ...item,
    latestPrice: { unitPrice: '3917.45', createdAt: '2026-05-01T12:00:00Z' },
  };
  for (const path of ['/catalog/item/11', '/catalog/node/2']) {
    setup(path, [...catalogRead, 'requests.viewPrices'], (url, init) => {
      if (url.startsWith('/catalog/items/11')) return Response.json(priced);
      if (url.startsWith('/catalog/nodes/2/items'))
        return Response.json(page([priced]));
      return fixtures(url, init);
    });
    expect(
      await screen.findByText(formatMoney('3917.45'), {
        normalizer: (value) => value,
      }),
    ).toBeDefined();
    cleanup();
  }
});

it('opens a folder by URL, updates the breadcrumb and returns to the parent on browser back', async () => {
  const { router } = setup('/catalog/node/1', catalogRead);
  fireEvent.click(await screen.findByRole('link', { name: /كابلات/ }));
  const bar = await screen.findByRole('navigation', { name: copy.breadcrumb });
  expect(router.state.location.pathname).toBe('/catalog/node/2');
  expect(within(bar).getByRole('link', { name: category.name })).toBeDefined();
  expect(bar.querySelector('[aria-current="page"]')?.textContent).toBe(
    group.name,
  );
  await act(async () => {
    await router.navigate(-1);
  });
  expect(router.state.location.pathname).toBe('/catalog/node/1');
  expect(
    (
      await screen.findByRole('navigation', { name: copy.breadcrumb })
    ).querySelector('[aria-current="page"]')?.textContent,
  ).toBe(category.name);
});

it('flattens the category search with item paths and uses the normalized, debounced query', async () => {
  const { fetch } = setup('/catalog/node/1', catalogRead);
  fireEvent.change(
    await screen.findByRole('searchbox', {
      name: copy.searchIn(category.name),
    }),
    { target: { value: 'سِلك' } },
  );
  expect(
    fetch.mock.calls.some(([path]) => path.includes('/catalog/search')),
  ).toBe(false);
  const result = await screen.findByRole('link', { name: /سلك معزول/ });
  expect(within(result).getByText('كهربا / كابلات')).toBeDefined();
  expect(
    fetch.mock.calls.some(
      ([path]) =>
        new URL(path, 'http://localhost').searchParams.get('q') === 'سلك',
    ),
  ).toBe(true);
  expect(screen.queryByRole('link', { name: /1 مجموعات/ })).toBeNull();
});

it('offers Other only in pick mode and reports item and folder choices to the caller', async () => {
  const onPickItem = vi.fn();
  const onAddOther = vi.fn();
  const path = '/requests/7/add/node/2';
  const router = createMemoryRouter(
    [
      {
        element: <AppProviders />,
        children: [
          {
            path: '/requests/:requestId/add/node/:nodeId',
            element: (
              <Explorer
                mode="pick"
                nodeHref={(id) => '/requests/7/add/node/' + id}
                onPickItem={onPickItem}
                onAddOther={onAddOther}
              />
            ),
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  setup(path, ['catalog.view'], fixtures, router);
  fireEvent.click(await screen.findByRole('button', { name: copy.other }));
  fireEvent.click(screen.getByRole('button', { name: /سلك معزول/ }));
  expect(onAddOther).toHaveBeenCalledWith(2);
  expect(onPickItem).toHaveBeenCalledWith(item);
  expect(
    screen.queryByRole('button', { name: copy.actionsFor(item.name) }),
  ).toBeNull();
  cleanup();
  setup('/catalog/node/2', catalogRead);
  await screen.findByRole('link', { name: /سلك معزول/ });
  expect(screen.queryByRole('button', { name: copy.other })).toBeNull();
  expect(
    screen.queryByRole('button', { name: copy.actionsFor(item.name) }),
  ).toBeNull();
});

it('gates each manage action and restricts moves to the same category outside the source subtree', async () => {
  setup('/catalog/node/1', [
    ...catalogRead,
    'catalogTree.view',
    'catalogTree.edit',
  ]);
  fireEvent.click(
    await screen.findByRole('button', { name: copy.actionsFor(group.name) }),
  );
  expect(screen.getByRole('button', { name: copy.renameGroup })).toBeDefined();
  expect(screen.queryByRole('button', { name: copy.addItemHere })).toBeNull();
  expect(screen.queryByRole('button', { name: ar.common.delete })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: copy.move }));
  const dialog = await screen.findByRole('dialog', { name: copy.move });
  expect(
    await within(dialog).findByRole('button', { name: category.name }),
  ).toBeDefined();
  expect(
    within(dialog).queryByRole('button', { name: secondCategory.name }),
  ).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: category.name }));
  await within(dialog).findByText(copy.emptyFolder);
  expect(within(dialog).queryByRole('button', { name: group.name })).toBeNull();
  expect(
    within(dialog).queryByRole('button', { name: copy.moveHere }),
  ).toBeNull();
});

it('keeps the last folder visible alongside a retry if a new folder fails', async () => {
  let failures = 0;
  setup('/catalog/node/1', catalogRead, (path, init) => {
    if (path === '/catalog/nodes/2/children' && failures++ < 1)
      return Response.json(
        {
          error: 'MISSING',
          message: 'تعذّر فتح المجلد',
          fix: 'جرّب الاتصال مرة تانية',
        },
        { status: 404 },
      );
    return fixtures(path, init);
  });
  fireEvent.click(await screen.findByRole('link', { name: /كابلات/ }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'جرّب الاتصال مرة تانية',
  );
  expect(screen.getByRole('link', { name: /كابلات.*مجموعات/ })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: ar.common.retry }));
  expect(await screen.findByRole('link', { name: /سلك معزول/ })).toBeDefined();
});

it('selects inherited attributes, removes and adds fields, and validates decimal and option values', async () => {
  const { fetch, router } = setup('/catalog/node/2/new', [
    ...catalogRead,
    'catalog.create',
  ]);
  const dialog = await screen.findByRole('dialog', { name: copy.addItem });
  await within(dialog).findByLabelText(gauge.name);
  expect(within(dialog).getByText(gauge.unitLabel!)).toBeDefined();
  expect(within(dialog).getByLabelText(material.name)).toBeDefined();
  expect(within(dialog).getByDisplayValue(copy.generatedCode)).toBeDefined();
  fireEvent.change(within(dialog).getByLabelText(admin.name), {
    target: { value: item.name },
  });
  fireEvent.change(within(dialog).getByLabelText(copy.unit), {
    target: { value: String(piece.id) },
  });
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: ar.common.delete + ' ' + material.name,
    }),
  );
  expect(within(dialog).queryByLabelText(material.name)).toBeNull();
  fireEvent.change(within(dialog).getByLabelText(copy.chooseAttribute), {
    target: { value: String(color.id) },
  });
  fireEvent.click(
    within(dialog).getByRole('button', { name: copy.addAttribute }),
  );
  fireEvent.change(within(dialog).getByLabelText(gauge.name), {
    target: { value: '-' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: ar.common.save }));
  expect(within(dialog).getByText(copy.invalidNumber)).toBeDefined();
  expect(
    within(dialog).getByText(copy.chooseOption, { selector: 'p' }),
  ).toBeDefined();
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
    false,
  );
  fireEvent.change(within(dialog).getByLabelText(gauge.name), {
    target: { value: '٢٫٥' },
  });
  fireEvent.change(within(dialog).getByLabelText(color.name), {
    target: { value: '4' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: ar.common.save }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/catalog/item/11'),
  );
  const submission = fetch.mock.calls.find(
    ([, init]) => init?.method === 'POST',
  )?.[1];
  expect(JSON.parse(String(submission?.body)).attributeValues).toEqual([
    { attributeId: gauge.id, value: '2.5' },
    { attributeId: color.id, value: 4 },
  ]);
});

it('asks before leaving an edited item form and can keep the draft', async () => {
  const { router } = setup('/catalog/node/2/new', [
    ...catalogRead,
    'catalog.create',
  ]);
  fireEvent.change(await screen.findByLabelText(admin.name), {
    target: { value: 'اسم جديد' },
  });
  fireEvent.click(screen.getByRole('button', { name: ar.common.cancel }));
  const confirm = await screen.findByRole('dialog', { name: ar.dialogs.leave });
  fireEvent.click(
    within(confirm).getByRole('button', { name: ar.common.cancel }),
  );
  expect(router.state.location.pathname).toBe('/catalog/node/2/new');
  expect(screen.getByDisplayValue('اسم جديد')).toBeDefined();
});

it('shows supplier phone errors live and formats a valid Egyptian mobile', async () => {
  const { fetch } = setup(
    '/master-data/suppliers',
    ['masterData.view', 'suppliers.view', 'suppliers.create'],
    (path, init) => {
      if (path === '/suppliers/category-choices')
        return Response.json([category]);
      if (path === '/suppliers' && init?.method === 'POST')
        return Response.json({ id: 51 }, { status: 201 });
      return Response.json(page([]));
    },
  );
  fireEvent.click(
    await screen.findByRole('button', { name: copy.addSupplier }),
  );
  const dialog = await screen.findByRole('dialog', { name: copy.addSupplier });
  const phone = await within(dialog).findByLabelText(copy.phone);
  fireEvent.change(within(dialog).getByLabelText(admin.name), {
    target: { value: 'مورد جديد' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: category.name }));
  fireEvent.change(phone, { target: { value: '0223456789' } });
  expect(within(dialog).getByText(copy.invalidPhone)).toBeDefined();
  fireEvent.click(within(dialog).getByRole('button', { name: ar.common.save }));
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
    false,
  );
  fireEvent.change(phone, { target: { value: '+20 101-234-5678' } });
  fireEvent.blur(phone);
  expect(within(dialog).getByDisplayValue('0101 234 5678')).toBeDefined();
  expect(within(dialog).queryByText(copy.invalidPhone)).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: ar.common.save }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: copy.addSupplier })).toBeNull(),
  );
  const submission = fetch.mock.calls.find(
    ([, init]) => init?.method === 'POST',
  )?.[1];
  expect(JSON.parse(String(submission?.body))).toMatchObject({
    whatsappNumber: '201012345678',
    categoryIds: [1],
  });
});

it.each([
  ['attributes', copy.emptyAttributes],
  ['units', copy.emptyUnits],
  ['suppliers', copy.emptySuppliers],
] as const)(
  'shows loading, server recovery, and empty states for %s',
  async (area, empty) => {
    let resolve: (value: Response) => void = () => {};
    let first = true;
    const pending = new Promise<Response>((done) => {
      resolve = done;
    });
    const permissions = ['masterData.view', `${area}.view`] as const;
    const fetch = vi.fn(async (input: string) => {
      if (input === '/api/v1/me')
        return Response.json({ ...profile, permissions });
      if (first) {
        first = false;
        return pending;
      }
      return Response.json(page([]));
    });
    vi.stubGlobal('fetch', fetch);
    const router = createMemoryRouter(routes, {
      initialEntries: ['/master-data/' + area],
    });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByText(ar.common.loading);
    await act(async () =>
      resolve(
        Response.json(
          {
            error: 'BAD',
            message: 'تعذّر تحميل البيانات',
            fix: 'جرّب تاني بعد شوية',
          },
          { status: 422 },
        ),
      ),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'جرّب تاني بعد شوية',
    );
    fireEvent.click(screen.getByRole('button', { name: ar.common.retry }));
    expect(await screen.findByText(empty)).toBeDefined();
  },
);
it('navigates ordered images and only renders client-approved details during presentation', async () => {
  const images = [1, 2].map((id) => ({
    id,
    thumbUrl: '/media/thumb-' + id,
    displayUrl: '/media/image-' + id,
    crop: null,
    width: 80,
    height: 60,
    order: id - 1,
    isCover: id === 1,
  }));
  const data = {
    ...item,
    images,
    description: 'ملاحظات داخلية',
    supplierName: 'مورد داخلي',
    attributeValues: [
      {
        attributeId: gauge.id,
        attribute: { ...gauge, clientVisible: true },
        value: '24',
        option: null,
      },
      {
        attributeId: material.id,
        attribute: { ...material, clientVisible: false },
        value: 'وصف داخلي',
        option: null,
      },
    ],
  };
  setup(
    '/catalog/item/11',
    [...catalogRead, 'requests.viewPrices'],
    (path, init) =>
      path === '/catalog/items/11' ? Response.json(data) : fixtures(path, init),
  );
  const pageCarousel = await screen.findByRole('region', {
    name: imageCopy.title,
  });
  expect(within(pageCarousel).getByText('1 / 2')).toBeTruthy();
  fireEvent.keyDown(
    within(pageCarousel).getByRole('button', { name: imageCopy.open + ' 1' }),
    { key: 'ArrowLeft' },
  );
  expect(within(pageCarousel).getByText('2 / 2')).toBeTruthy();
  expect(screen.getByText(copy.latestPrice)).toBeTruthy();
  const trigger = screen.getByRole('button', { name: imageCopy.client });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: item.name });
  expect(within(dialog).getByText(gauge.name)).toBeTruthy();
  expect(within(dialog).queryByText(material.name)).toBeNull();
  for (const privateText of [
    item.code,
    copy.latestPrice,
    data.description,
    data.supplierName,
    'وصف داخلي',
  ])
    expect(within(dialog).queryByText(privateText)).toBeNull();
  expect(within(dialog).getAllByRole('img')).toHaveLength(2);
  fireEvent.click(
    within(dialog).getByRole('button', { name: ar.common.close }),
  );
  expect(document.activeElement).toBe(trigger);
  expect(within(pageCarousel).getByText('2 / 2')).toBeTruthy();
});
it('lets a catalog-only engineer reach presentation from Home', async () => {
  const { router, fetch } = setup('/', ['catalog.view']);
  const link = await screen.findByRole('link', {
    name: new RegExp(copy.items),
  });
  expect(link.getAttribute('href')).toBe('/catalog');
  await act(() => router.navigate('/catalog/item/11'));
  await screen.findByRole('heading', { name: item.name });
  for (const [request] of fetch.mock.calls.filter(([request]) =>
    request.includes('/catalog/items/11'),
  ))
    expect(request).not.toContain('includeInactive');
  fireEvent.click(screen.getByRole('button', { name: imageCopy.client }));
  expect(screen.getByRole('dialog', { name: item.name })).toBeTruthy();
});

it('checks accessibility in a populated catalog folder', async () => {
  setup('/catalog/node/1', catalogRead);
  await screen.findByRole('link', { name: /كابلات/ });
  expect((await axe(document.body)).violations).toEqual([]);
});

it('enters and validates a labelled unit price, keeping an explicit zero', async () => {
  const { fetch, router } = setup('/catalog/node/2/new', [
    ...catalogRead,
    'catalog.create',
    'requests.viewPrices',
  ]);
  const dialog = within(
    await screen.findByRole('dialog', { name: copy.addItem }),
  );
  const price = await dialog.findByLabelText<HTMLInputElement>(
    copy.unitPriceField,
  );
  expect(dialog.getByText(copy.unitPriceHint)).toBeDefined();
  expect(price.value).toBe('');
  fireEvent.change(dialog.getByLabelText(admin.name), {
    target: { value: 'مفتاح' },
  });
  fireEvent.change(dialog.getByLabelText(copy.unit), {
    target: { value: String(piece.id) },
  });
  for (const attribute of [gauge, material])
    fireEvent.click(
      dialog.getByRole('button', {
        name: ar.common.delete + ' ' + attribute.name,
      }),
    );
  fireEvent.change(price, { target: { value: '1.234' } });
  fireEvent.click(dialog.getByRole('button', { name: ar.common.save }));
  expect(dialog.getByText(copy.invalidUnitPrice)).toBeDefined();
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
    false,
  );
  fireEvent.change(price, { target: { value: '٠' } });
  expect(price.value).toBe('0');
  fireEvent.click(dialog.getByRole('button', { name: ar.common.save }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/catalog/item/11'),
  );
  const submission = fetch.mock.calls.find(
    ([, init]) => init?.method === 'POST',
  )?.[1];
  expect(JSON.parse(String(submission?.body)).unitPrice).toBe('0');
});

it('edits, clears and shows the unit price only with the price grant', async () => {
  const priced: CatalogItem = { ...item, unitPrice: '12.50' };
  const handler = (path: string, init?: RequestInit) =>
    path === '/catalog/items/11/editor' && init?.method === 'PATCH'
      ? Response.json({ ...priced, ...JSON.parse(String(init.body)) })
      : path === '/catalog/items/11'
        ? Response.json(priced)
        : fixtures(path, init);
  const editor = [...catalogRead, 'catalog.edit'] as PermissionKey[];
  const { fetch } = setup(
    '/catalog/item/11/edit',
    [...editor, 'requests.viewPrices'],
    handler,
  );
  // The item page lists the entered price next to the latest purchase price.
  expect(
    await screen.findByText(formatMoney('12.50'), {
      normalizer: (value) => value,
    }),
  ).toBeDefined();
  const dialog = within(
    await screen.findByRole('dialog', { name: copy.editItem }),
  );
  const price = await dialog.findByLabelText<HTMLInputElement>(
    copy.unitPriceField,
  );
  expect(price.value).toBe('12.50');
  fireEvent.change(price, { target: { value: '' } });
  fireEvent.click(dialog.getByRole('button', { name: admin.saveChanges }));
  await waitFor(() =>
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(
      true,
    ),
  );
  const patch = fetch.mock.calls.find(([, init]) => init?.method === 'PATCH');
  expect(JSON.parse(String(patch?.[1]?.body))).toHaveProperty(
    'unitPrice',
    null,
  );
  cleanup();

  // Without the grant the API omits the price, and the form neither shows nor sends it.
  const hidden = setup('/catalog/item/11/edit', editor, (path, init) =>
    path === '/catalog/items/11/editor' && init?.method === 'PATCH'
      ? Response.json({ ...item, ...JSON.parse(String(init.body)) })
      : fixtures(path, init),
  );
  const blind = within(
    await screen.findByRole('dialog', { name: copy.editItem }),
  );
  await blind.findByLabelText(admin.name);
  expect(blind.queryByLabelText(copy.unitPriceField)).toBeNull();
  expect(screen.queryByText(copy.unitPrice)).toBeNull();
  fireEvent.click(blind.getByRole('button', { name: admin.saveChanges }));
  await waitFor(() =>
    expect(
      hidden.fetch.mock.calls.some(([, init]) => init?.method === 'PATCH'),
    ).toBe(true),
  );
  const blindPatch = hidden.fetch.mock.calls.find(
    ([, init]) => init?.method === 'PATCH',
  );
  expect(JSON.parse(String(blindPatch?.[1]?.body))).not.toHaveProperty(
    'unitPrice',
  );
});

it('marks a missing unit price as not set for price viewers', async () => {
  setup(
    '/catalog/item/11',
    [...catalogRead, 'requests.viewPrices'],
    (path, init) =>
      path === '/catalog/items/11'
        ? Response.json({ ...item, unitPrice: null })
        : fixtures(path, init),
  );
  expect(await screen.findByText(copy.unitPrice)).toBeDefined();
  expect(screen.getByText(copy.unitPriceUnset)).toBeDefined();
});
