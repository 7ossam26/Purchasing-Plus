import { z } from 'zod';

const cursor = z
  .string()
  .regex(/^\d{1,10}$/)
  .transform(Number)
  .pipe(z.number().int().min(0).max(2147483647));
export const eventStreamInput = z.strictObject({
  ticket: z.string().regex(/^[a-f0-9]{64}$/),
  after: cursor.optional(),
});
export const lastEventIdInput = cursor.optional();
export const notificationsInput = z.strictObject({
  page: z
    .string()
    .regex(/^[1-9]\d{0,6}$/)
    .transform(Number)
    .default(1),
});
