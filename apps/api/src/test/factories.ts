import { hash } from '@node-rs/argon2';
import type { PrismaClient, SiteScope } from '@prisma/client';
import {
  closeOverRequires,
  type PermissionKey,
} from '@purchasing-plus/shared/permissions';
export const testPassword = 'sample-test-password';
export async function makeUser(
  db: PrismaClient,
  username: string,
  keys: PermissionKey[],
  siteScope: SiteScope = 'ASSIGNED',
  ids: number[] = [],
) {
  const role = await db.role.create({
    data: {
      name: username,
      siteScope,
      permissions: { create: closeOverRequires(keys).map((key) => ({ key })) },
    },
  });
  return db.user.create({
    data: {
      username,
      name: username,
      roleId: role.id,
      passwordHash: await hash(testPassword),
      sites: { create: ids.map((siteId) => ({ siteId })) },
    },
  });
}
