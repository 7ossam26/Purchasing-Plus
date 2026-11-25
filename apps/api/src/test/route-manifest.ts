import {
  recordDestinations,
  reportDestinations,
  reportHubKeys,
} from '@purchasing-plus/shared';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';

export type Method = 'get' | 'post' | 'patch' | 'delete' | 'put';
type Grant = PermissionKey | readonly PermissionKey[];
export interface RouteCase {
  method: Method;
  path: string;
  // Each group is independently necessary. Members within a group are alternatives.
  groups: readonly (readonly PermissionKey[])[];
}
const routes: RouteCase[] = [];
function add(method: Method, paths: string, ...grants: Grant[]) {
  for (const path of paths.split(' '))
    routes.push({
      method,
      path,
      groups: grants.map((g) => (typeof g === 'string' ? [g] : g)),
    });
}
export const publicRoutes = [
  'get /api/health',
  'get /api/v1/media/*key',
  'post /api/v1/auth/login',
];
add('get', '/me /settings /inbox /events/stream');
add('post', '/me/password /auth/logout /events/ticket');
add('get', '/notifications', 'requests.view');
add('post', '/notifications/:id/read /notifications/read-all', 'requests.view');
add('put', '/settings', 'settings.manage');
add('get', '/users /users/options', 'users.view');
add('post', '/users /users/:id/reset-password', 'users.manage');
add('patch', '/users/:id', 'users.manage');
add('get', '/system/superadmins', 'system.superadmins');
add(
  'post',
  '/system/superadmins /system/superadmins/:id/reset-password',
  'system.superadmins',
);
add('patch', '/system/superadmins/:id', 'system.superadmins');
add('get', '/system/audit-log /system/audit-log/verify', 'system.auditLog');
add('post', '/system/maintenance/:action', 'system.maintenance');
add('get', '/roles /roles/:id', 'roles.view');
add('get', '/roles/assignable-keys', 'roles.manage');
add('post', '/roles', 'roles.manage');
add('patch', '/roles/:id', 'roles.manage');
add('delete', '/roles/:id', 'roles.manage');
add('get', '/sites/engineers', 'users.manage', ['sites.create', 'sites.edit']);
add('get', '/sites/:id/engineers', 'sites.view', 'users.manage');
for (const area of ['sites', 'attributes', 'units', 'suppliers'] as const) {
  const root = '/' + area;
  add('get', root, `${area}.view`);
  add('post', root, `${area}.create`);
  add('patch', root + '/:id', `${area}.edit`);
  add('delete', root + '/:id', `${area}.delete`);
  if (area !== 'sites') {
    add('get', root + '/:id', `${area}.view`);
    add('post', root + '/:id/deactivate', `${area}.delete`);
  }
}
add('get', '/suppliers/category-choices', 'suppliers.view', [
  'suppliers.create',
  'suppliers.edit',
]);
add(
  'post',
  '/attributes/:id/options /attributes/:id/options/:optionId/deactivate',
  'attributes.edit',
);
add('patch', '/attributes/:id/options/:optionId', 'attributes.edit');
add('delete', '/attributes/:id/options/:optionId', 'attributes.edit');
add(
  'put',
  '/attributes/:id/options/order /nodes/:id/attributes',
  'attributes.edit',
);
add(
  'get',
  '/nodes/:id/attributes /nodes/:id/effective-attributes',
  'attributes.view',
);
add(
  'get',
  '/catalog-tree/categories /catalog-tree/nodes/:id /catalog-tree/nodes/:id/children',
  'catalogTree.view',
);
add(
  'post',
  '/catalog-tree/categories /catalog-tree/nodes',
  'catalogTree.create',
);
add('put', '/catalog-tree/nodes/order', 'catalogTree.edit');
add('patch', '/catalog-tree/nodes/:id', 'catalogTree.edit');
add('post', '/catalog-tree/nodes/:id/move', 'catalogTree.edit');
add('post', '/catalog-tree/nodes/:id/deactivate', 'catalogTree.delete');
add('delete', '/catalog-tree/nodes/:id', 'catalogTree.delete');
add(
  'get',
  '/catalog/categories /catalog/nodes/:id /catalog/nodes/:id/children /catalog/nodes/:id/items /catalog/items/:id /catalog/search',
  'catalog.view',
);
add(
  'get',
  '/catalog/nodes/:id/editor-choices',
  'catalog.view',
  'masterData.view',
  ['catalog.create', 'catalog.edit'],
);
add('post', '/catalog/items', 'catalog.create');
add('patch', '/catalog/items/:id /catalog/items/:id/editor', 'catalog.edit');
add(
  'post',
  '/catalog/items/:id/move /catalog/items/:id/images',
  'catalog.edit',
);
add(
  'put',
  '/catalog/items/:id/images/order /catalog/items/:id/images/:imageId/cover',
  'catalog.edit',
);
add('delete', '/catalog/items/:id/images/:imageId', 'catalog.edit');
add('delete', '/catalog/items/:id', 'catalog.delete');
add('get', '/data/templates/:entity', 'data.import');
add(
  'post',
  '/data/import/:entity/preview /data/import/:entity/commit',
  'data.import',
);
add('get', '/data/export/:entity', 'data.export');
add('get', '/reports/options', reportHubKeys);
add(
  'get',
  '/reports/price-history/items',
  'reports.priceHistory',
  'requests.viewPrices',
);
for (const [id, key] of [
  ...reportDestinations,
  ...recordDestinations.map(([id]) => [id, 'records.view'] as const),
]) {
  const path = (key === 'records.view' ? '/records/' : '/reports/') + id;
  add('get', path, key);
  add('get', path + '?format=xlsx', key, 'reports.export');
}
add(
  'get',
  '/requests /requests/options /requests/:id /requests/:id/purchasing',
  'requests.view',
);
add('get', '/requests/:id/rounds/:n', 'requests.view', [
  'pricing.approve',
  'pricing.reject',
]);
add('get', '/requests/recent-items', 'requests.create', 'catalog.view');
add('get', '/requests/:id/timeline', 'requests.viewTimeline');
add(
  'post',
  '/requests /requests/:id/copy /requests/:id/submit /requests/:id/resubmit',
  'requests.create',
);
add('patch', '/requests/:id /requests/:id/draft', 'requests.create');
add('delete', '/requests/:id', 'requests.create');
add('post', '/requests/:id/approve', 'requests.approve');
add('post', '/requests/:id/reject', 'requests.reject');
add('post', '/requests/:id/return', 'requests.returnForEdit');
add('post', '/requests/:id/urgency', 'requests.raiseUrgency');
add('patch', '/requests/:id/quantities', 'requests.editQuantities');
add('post', '/requests/:id/pause /requests/:id/resume', 'requests.pause');
add('patch', '/requests/:id/paused-edit', 'requests.editWhilePaused');
add('post', '/requests/:id/purchasing-return', 'purchasing.returnForEdit');
add(
  'post',
  '/requests/:id/items/:itemId/add-to-catalog',
  'catalog.create',
  'requests.view',
);
const purchasing = '/requests/:id/purchasing';
add('get', purchasing + '/suppliers', 'requests.viewSupplierNames', [
  'purchasing.price',
  'purchasing.handleRemaining',
]);
add('post', purchasing + '/batches', 'purchasing.sendRfq');
const supplier = purchasing + '/batches/:batchId/suppliers/:supplierId';
add('post', supplier + '/sent', 'purchasing.sendRfq');
add('patch', supplier, 'purchasing.sendRfq');
add('patch', purchasing + '/items/:itemId/pricing', 'purchasing.price');
add('post', purchasing + '/items/:itemId/unavailable', 'purchasing.price');
add('delete', purchasing + '/items/:itemId/unavailable', 'purchasing.price');
add('put', purchasing + '/delivery-fee', 'purchasing.price');
add('post', purchasing + '/submit-pricing', 'purchasing.price');
add('post', '/requests/:id/rounds/:n/approve', 'pricing.approve');
add('post', '/requests/:id/rounds/:n/reject', 'pricing.reject');
add('get', '/requests/:id/supply-orders', 'purchasing.sendSupplyOrder');
add('patch', '/requests/:id/supply-orders/:n', 'purchasing.sendSupplyOrder');
add(
  'post',
  '/requests/:id/supply-orders/:n/sent',
  'purchasing.sendSupplyOrder',
);
add('post', '/requests/:id/receipts', 'receipt.record');
add(
  'post',
  '/requests/:id/items/:itemId/still-coming /requests/:id/items/:itemId/reprice',
  'purchasing.handleRemaining',
);
add(
  'post',
  '/requests/:id/items/:itemId/resolve-externally',
  'items.resolveExternally',
);
add('post', '/requests/:id/cancel', 'requests.cancelAnyStage');
export const routeManifest = routes;
