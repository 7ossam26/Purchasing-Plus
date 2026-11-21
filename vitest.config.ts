import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import sharedPackage from './packages/shared/package.json' with { type: 'json' };

// Resolve the same public entry points in every test project so v8 counts the
// source exercised by HTTP and component tests as well as direct unit tests.
const sharedAliases = Object.entries(sharedPackage.exports)
  .map(([key, entry]) => ({
    find: sharedPackage.name + key.slice(1),
    replacement: fileURLToPath(
      new URL('./packages/shared/' + entry.types, import.meta.url),
    ).replaceAll('\\', '/'),
  }))
  .sort((a, b) => b.find.length - a.find.length);

process.loadEnvFile('apps/api/.env.example');

export default defineConfig({
  test: {
    // HTTP suites reset the same PostgreSQL database between files.
    fileParallelism: false,
    projects: [
      {
        resolve: { alias: sharedAliases },
        test: {
          name: 'shared',
          environment: 'node',
          include: ['packages/shared/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: sharedAliases },
        test: {
          name: 'api',
          globalSetup: 'apps/api/src/test/migrate.ts',
          environment: 'node',
          include: ['apps/api/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: sharedAliases },
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
