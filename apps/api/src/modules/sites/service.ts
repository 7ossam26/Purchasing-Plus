import * as s from '@purchasing-plus/shared';
import { admin } from '@purchasing-plus/shared/i18n/ar';

import {
  allowed,
  assertSiteInScope,
  forbidden,
  type Viewer,
} from '../../middleware/access.js';
import { AppError } from '../../middleware/errors.js';
import type { Context } from '../access/endpoint.js';
import { canGrant } from '../roles/service.js';

import * as repo from './repo.js';

const errors = admin.siteManager.errors;
const ascending = (ids: Iterable<number>) => [...ids].sort((a, b) => a - b);
const inScope = (viewer: Viewer, siteId: number) =>
  viewer.isSuperadmin ||
  viewer.siteScope === 'ALL' ||
  viewer.siteIds.includes(siteId);

// The users editor's guard: the viewer can grant the account's role and reaches all of its sites.
function manages(viewer: Viewer, account: repo.SiteAccount) {
  if (viewer.isSuperadmin) return true;
  return (
    account.id !== viewer.userId &&
    account.role !== null &&
    canGrant(
      viewer,
      account.role.siteScope,
      account.role.permissions.map(({ key }) => key),
    ) &&
    account.sites.every(({ siteId }) => inScope(viewer, siteId))
  );
}
function assertManages(viewer: Viewer, account: repo.SiteAccount) {
  if (!viewer.isSuperadmin && account.id === viewer.userId)
    throw forbidden(errors.ownSites, errors.ownSitesFix);
  if (!manages(viewer, account))
    throw forbidden(errors.engineerForbidden, errors.engineerForbiddenFix);
}
const invalidEngineers = () =>
  new AppError(
    422,
    'INVALID_ENGINEERS',
    errors.invalidEngineers,
    errors.invalidEngineersFix,
  );

async function changeEngineers(
  c: Context,
  site: { id: number; isActive: boolean },
  { add, remove }: { add: number[]; remove: number[] },
) {
  if (!allowed(c.viewer, 'users.manage')) throw forbidden();
  if (!inScope(c.viewer, site.id))
    throw forbidden(errors.siteOutOfScope, errors.siteOutOfScopeFix);
  if (add.length && !site.isActive)
    throw new AppError(
      422,
      'INACTIVE_SITE',
      errors.inactiveSite,
      errors.inactiveSiteFix,
    );
  const assigned = new Set(
    (await repo.siteEngineers(c.tx, site.id)).map(({ id }) => id),
  );
  const accounts = new Map(
    (await repo.accountsByIds(c.tx, [...add, ...remove])).map((account) => [
      account.id,
      account,
    ]),
  );
  for (const id of [...add, ...remove]) {
    const account = accounts.get(id);
    if (
      !account ||
      !repo.isSiteEngineer(account) ||
      (add.includes(id) && !account.isActive)
    )
      throw invalidEngineers();
    // Repeating an add or a remove that already took effect leaves the site unchanged.
    const changes = add.includes(id) ? !assigned.has(id) : assigned.has(id);
    if (changes) assertManages(c.viewer, account);
  }
  const added = add.filter((id) => !assigned.has(id));
  const removed = remove.filter((id) => assigned.has(id));
  if (added.length) await repo.assignEngineers(c.tx, site.id, added);
  if (removed.length) await repo.unassignEngineers(c.tx, site.id, removed);
  return {
    before: ascending(assigned),
    after: ascending(
      [...assigned].filter((id) => !removed.includes(id)).concat(added),
    ),
  };
}

export function listSites({ tx, req, viewer }: Context) {
  const filters = s.siteFilters.parse(req.query);
  return repo.listSites(
    tx,
    viewer.isSuperadmin || viewer.siteScope === 'ALL'
      ? undefined
      : viewer.siteIds,
    filters,
  );
}

export async function createSite(c: Context) {
  const { engineerIds, ...data } = s.createSiteInput.parse(c.req.body);
  const row = await repo.createSite(c.tx, data);
  const engineers = engineerIds.length
    ? await changeEngineers(c, row, { add: engineerIds, remove: [] })
    : null;
  await c.audit(
    'site.create',
    'Site',
    row.id,
    null,
    engineers ? { ...row, engineerIds: engineers.after } : row,
  );
  return row;
}

export async function updateSite(c: Context) {
  const id = s.pathId.parse(c.req.params.id);
  assertSiteInScope(c.viewer, id);
  const { engineers: changes, ...data } = s.editSiteInput.parse(c.req.body);
  const { before, after } = await repo.updateSite(c.tx, id, data);
  const engineers =
    changes && (changes.add.length || changes.remove.length)
      ? await changeEngineers(c, after, changes)
      : null;
  await c.audit(
    'site.update',
    'Site',
    id,
    engineers ? { ...before, engineerIds: engineers.before } : before,
    engineers ? { ...after, engineerIds: engineers.after } : after,
  );
  return after;
}

export async function deactivateSite(c: Context) {
  const id = s.pathId.parse(c.req.params.id);
  assertSiteInScope(c.viewer, id);
  s.emptyInput.parse(c.req.body ?? {});
  const { before, after } = await repo.updateSite(c.tx, id, {
    isActive: false,
  });
  await c.audit('site.deactivate', 'Site', id, before, after);
  return after;
}

export async function assignedEngineers({ tx, req, viewer }: Context) {
  const id = s.pathId.parse(req.params.id);
  assertSiteInScope(viewer, id);
  s.emptyInput.parse(req.query);
  await repo.findSite(tx, id);
  const rows = await repo.siteEngineers(tx, id);
  return {
    items: rows.map((account) => ({
      id: account.id,
      name: account.name,
      username: account.username,
      isActive: account.isActive,
      canManage: manages(viewer, account),
    })),
  };
}

export async function engineerOptions({ tx, req, viewer }: Context) {
  if (!allowed(viewer, 'sites.create') && !allowed(viewer, 'sites.edit'))
    throw forbidden();
  const { page, pageSize, search } = s.siteEngineerFilters.parse(req.query);
  const rows = await repo.engineerCandidates(
    tx,
    viewer.isSuperadmin
      ? { search }
      : {
          search,
          excludeId: viewer.userId,
          keys: [...viewer.permissions],
          siteIds: viewer.siteScope === 'ALL' ? undefined : viewer.siteIds,
        },
  );
  const items = rows.filter((account) => manages(viewer, account));
  return {
    items: items
      .slice((page - 1) * pageSize, page * pageSize)
      .map(({ id, name, username, sites }) => ({
        id,
        name,
        username,
        sites: sites.map(({ siteId, site }) => ({
          id: siteId,
          name: site.name,
        })),
      })),
    total: items.length,
    page,
    pageSize,
  };
}
