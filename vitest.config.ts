import { defineConfig } from 'vitest/config';

process.loadEnvFile('apps/api/.env.example');

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'shared', environment: 'node', include: ['packages/shared/**/*.test.ts'] } },
      { test: { name: 'api', environment: 'node', include: ['apps/api/**/*.test.ts'] } },
      { test: { name: 'web', environment: 'jsdom', include: ['apps/web/**/*.test.{ts,tsx}'] } },
    ],
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/shared/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/src/test/**'],
      reporter: ['text', 'lcov'],
      thresholds: {
        'packages/shared/src/**': { lines: 90 },
        'apps/api/src/modules/**/service.ts': { lines: 80 },
      },
    },
  },
});
