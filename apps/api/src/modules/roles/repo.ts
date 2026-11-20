import { missing } from '../../middleware/access.js';
import { roleInclude, type Tx } from '../access/repo.js';
export function userHoldsRole(tx: Tx, id: number, roleId: number) {
  return tx.user.count({ where: { id, roleId } });
}
export async function roleById(tx: Tx, id: number) {
  const role = await tx.role.findUnique({
    where: { id },
    include: roleInclude,
  });
  if (!role) throw missing();
  return role;
}
export type RoleRow = Awaited<ReturnType<typeof roleById>>;
export async function listRoles(tx: Tx, page: number, pageSize: number) {
  const rows = await tx.role.findMany({
    orderBy: { id: 'asc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: roleInclude,
  });
  return {
    items: rows,
    total: await tx.role.count(),
    page,
    pageSize,
  };
}
type RoleData = {
  name: string;
  siteScope: 'ASSIGNED' | 'ALL';
  description: string;
};
function permissionRows(keys: string[]) {
  return [...new Set(keys)].map((key) => ({ key }));
}
export function insertRole(tx: Tx, data: RoleData, keys: string[]) {
  return tx.role.create({
    data: { ...data, permissions: { create: permissionRows(keys) } },
    include: roleInclude,
  });
}
export function updateRole(
  tx: Tx,
  role: RoleRow,
  data: Partial<RoleData>,
  keys: string[] | undefined,
) {
  const updatedAt = new Date(
    Math.max(Date.now(), role.updatedAt.getTime() + 1),
  );
  return tx.role.update({
    where: { id: role.id },
    data: {
      ...data,
      updatedAt,
      permissions: keys
        ? { deleteMany: {}, create: permissionRows(keys) }
        : undefined,
    },
    include: roleInclude,
  });
}
export function deleteRole(tx: Tx, id: number) {
  return tx.role.delete({ where: { id } });
}
