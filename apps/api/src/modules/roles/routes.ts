import * as s from '@purchasing-plus/shared';
import { Router } from 'express';

import { AppError } from '../../middleware/errors.js';
import { endpoint } from '../access/endpoint.js';

import {
  listRoles,
  insertRole,
  updateRole,
  deleteRole,
  roleById,
  heldRoleId,
} from './repo.js';
import { assertEditable, assertGrant, assignable, roleDto } from './service.js';
export const roles = Router();
roles.get(
  '/assignable-keys',
  ...endpoint(['roles.manage'], async ({ viewer, req }) => {
    s.emptyInput.parse(req.query);
    return assignable(viewer);
  }),
);
roles.get(
  '/',
  ...endpoint(['roles.view'], async ({ tx, req, viewer }) => {
    const { page, pageSize } = s.pagination.parse(req.query);
    const result = await listRoles(tx, page, pageSize);
    const ownRoleId = await heldRoleId(tx, viewer.userId);
    return {
      ...result,
      items: result.items.map((r) => roleDto(r, viewer, ownRoleId)),
    };
  }),
);
roles.get(
  '/:id',
  ...endpoint(['roles.view'], async ({ tx, req, viewer }) =>
    roleDto(
      await roleById(tx, s.pathId.parse(req.params.id)),
      viewer,
      await heldRoleId(tx, viewer.userId),
    ),
  ),
);
roles.post(
  '/',
  ...endpoint(
    ['roles.manage'],
    async ({ tx, req, viewer, audit }) => {
      const { keys, ...data } = s.createRole.parse(req.body);
      assertGrant(viewer, data.siteScope, keys);
      const row = await insertRole(tx, data, keys);
      const dto = roleDto(row, viewer);
      await audit('role.create', 'Role', row.id, null, dto);
      return dto;
    },
    201,
  ),
);
roles.patch(
  '/:id',
  ...endpoint(['roles.manage'], async ({ tx, req, viewer, audit }) => {
    const { keys, ...data } = s.editRole.parse(req.body);
    const old = await roleById(tx, s.pathId.parse(req.params.id));
    await assertEditable(tx, viewer, old);
    assertGrant(
      viewer,
      data.siteScope ?? old.siteScope,
      keys ?? old.permissions.map((p) => p.key),
    );
    const row = await updateRole(tx, old, data, keys);
    const dto = roleDto(row, viewer);
    await audit('role.update', 'Role', row.id, roleDto(old, viewer), dto);
    return dto;
  }),
);
roles.delete(
  '/:id',
  ...endpoint(
    ['roles.manage'],
    async ({ tx, req, viewer, audit }) => {
      s.emptyInput.parse(req.body ?? {});
      const old = await roleById(tx, s.pathId.parse(req.params.id));
      await assertEditable(tx, viewer, old);
      if (old._count.users)
        throw new AppError(
          409,
          'ROLE_IN_USE',
          'عدد المستخدمين المرتبطين بهذا الدور: ' + old._count.users,
          'اسند للمستخدمين دورًا تاني قبل حذف الدور ده.',
        );
      await deleteRole(tx, old.id);
      await audit('role.delete', 'Role', old.id, roleDto(old, viewer));
      return null;
    },
    204,
  ),
);
