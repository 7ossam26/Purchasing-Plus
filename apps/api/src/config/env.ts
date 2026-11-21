import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);

export const storageEnvSchema = z
  .object({
    STORAGE_DRIVER: z.enum(['local', 'r2']),
    R2_ACCOUNT_ID: z.string().trim().optional(),
    R2_ACCESS_KEY_ID: z.string().trim().optional(),
    R2_SECRET_ACCESS_KEY: z.string().trim().optional(),
    R2_BUCKET: z.string().trim().optional(),
    STORAGE_PUBLIC_BASE_URL: z
      .union([
        z.url({ protocol: /^https?$/ }).refine((value) => {
          const url = URL.parse(value);
          return (
            !!url && !url.username && !url.password && !url.search && !url.hash
          );
        }),
        z.literal(''),
      ])
      .optional(),
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
    if (env.R2_ACCOUNT_ID && !/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID))
      ctx.addIssue({
        code: 'custom',
        path: ['R2_ACCOUNT_ID'],
        message: 'Expected a Cloudflare account ID',
      });
  });

export const envSchema = storageEnvSchema
  .safeExtend({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('production'),
    DATABASE_URL: z.url().startsWith('postgresql://'),
    DATABASE_URL_TEST: z.url().startsWith('postgresql://').optional(),
    SESSION_SECRET: nonEmpty,
    AUDIT_HMAC_SECRET: nonEmpty,
    SUPERADMIN_USERNAME: nonEmpty,
    SUPERADMIN_PASSWORD: nonEmpty,
    PUBLIC_ORIGIN: z.url({ protocol: /^https?$/ }).refine((value) => {
      const url = URL.parse(value);
      return !!url && (value === url.origin || value === url.origin + '/');
    }),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['PUBLIC_ORIGIN', 'STORAGE_PUBLIC_BASE_URL'] as const) {
      if (env[key] && !env[key].startsWith('https://'))
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'HTTPS is required in production',
        });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(values: NodeJS.ProcessEnv): AppEnv {
  const result = envSchema.safeParse(values);
  if (result.success) return result.data;
  const fields = [
    ...new Set(
      result.error.issues.map((issue) =>
        issue.code === 'custom'
          ? `${issue.path.join('.')} (${issue.message})`
          : issue.path.join('.'),
      ),
    ),
  ].join(', ');
  throw new Error(
    `إعدادات البيئة ناقصة أو غير صحيحة / Missing or invalid environment variables: ${fields}`,
  );
}
