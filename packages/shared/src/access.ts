import { z } from 'zod';
export const emptyInput = z.strictObject({});
export const username = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9._-]{1,100}$/)
  .toLowerCase();
const password = z.string().min(8).max(512);
const name = z.string().trim().min(1).max(200);
export const id = z.number().int().positive().max(2147483647);
export const pathId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(id);
export const login = z.strictObject({
  username,
  password: z.string().min(1).max(512),
});
export const changePassword = z.strictObject({
  currentPassword: z.string().min(1).max(512),
  newPassword: password,
});
export const resetPassword = z.strictObject({ password });
const accountFields = { name, username, password };
export const createSupport = z.strictObject(accountFields);
export const editSupport = createSupport
  .omit({ password: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });
export const createUser = createSupport.extend({
  roleId: id,
  siteIds: z.array(id).default([]),
});
export const editUser = createUser
  .omit({ password: true })
  .partial()
  .extend({
    siteIds: z.array(id).optional(),
    isActive: z.boolean().optional(),
  });
export const createRole = z.strictObject({
  name,
  description: z.string().max(2000).default(''),
  siteScope: z.enum(['ALL', 'ASSIGNED']),
  keys: z.array(z.string()),
});
export const editRole = createRole
  .partial()
  .extend({ description: z.string().max(2000).optional() });
export const createSite = z.strictObject({
  name,
  address: z.string().trim().max(1000).default(''),
});
export const editSite = z.strictObject({
  name: name.optional(),
  address: z.string().trim().max(1000).optional(),
});
export const pagination = z.strictObject({
  page: pathId.default(1),
  pageSize: pathId.pipe(z.number().max(100)).default(25),
});
export const userFilters = pagination.extend({
  search: z.string().max(200).optional(),
  roleId: pathId.optional(),
  siteId: pathId.optional(),
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export const auditFilters = pagination.extend({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  userId: pathId.optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
});
