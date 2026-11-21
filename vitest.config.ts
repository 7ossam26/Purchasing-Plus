import { defineConfig } from 'vitest/config';

process.loadEnvFile('apps/api/.env.example');

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          environment: 'node',
          include: ['packages/shared/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'api',
          fileParallelism: false,
          globalSetup: 'apps/api/src/test/migrate.ts',
          environment: 'node',
          include: ['apps/api/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/**/*.test.{ts,tsx}'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'apps/*/src/**/*.{ts,tsx}',
        'packages/shared/src/**/*.{ts,tsx}',
      ],
      exclude: ['**/*.test.{ts,tsx}', '**/src/test/**'],
      reporter: ['text', 'lcov'],
      thresholds: {
        'packages/shared/src/**': { lines: 90 },
        'packages/shared/src/lifecycle/**': { lines: 95 },
        'apps/api/src/modules/**/service.ts': { lines: 80 },
      },
    },
  },
});
