import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);

export const envSchema = z
  .object({
    DATABASE_URL: z.url().startsWith('postgresql://'),
    DATABASE_URL_TEST: z.url().startsWith('postgresql://').optional(),
    SESSION_SECRET: nonEmpty,
    AUDIT_HMAC_SECRET: nonEmpty,
    SUPERADMIN_USERNAME: nonEmpty,
    SUPERADMIN_PASSWORD: nonEmpty,
    PUBLIC_ORIGIN: z.url({ protocol: /^https?$/ }),
    STORAGE_DRIVER: z.enum(['local', 'r2']),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    STORAGE_PUBLIC_BASE_URL: z.union([z.url(), z.literal('')]).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER !== 'r2') return;
    for (const key of [
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
    ] as const) {
      if (!env[key])
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Required for R2 storage',
        });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(values: NodeJS.ProcessEnv): AppEnv {
  const result = envSchema.safeParse(values);
  if (result.success) return result.data;
  const fields = [
    ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
  ].join(', ');
  throw new Error(
    `إعدادات البيئة ناقصة أو غير صحيحة / Missing or invalid environment variables: ${fields}`,
  );
}
