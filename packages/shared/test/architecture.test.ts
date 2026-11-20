import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkFiles, findForbiddenSharedImports, findPhysicalClasses, findRoleLogic, sourceFiles } from './architecture.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const appSources = readdirSync(join(root, 'apps'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => sourceFiles(join(root, 'apps', entry.name, 'src')));
const packageSources = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => sourceFiles(join(root, 'packages', entry.name, 'src')));
const sharedSources = sourceFiles(join(root, 'packages/shared/src'));

function fixture(name: string): string {
  return readFileSync(join(root, 'packages/shared/test/fixtures', name), 'utf8');
}

describe('architecture guardrails', () => {
  it('rejects role-name logic in source files', () => {
    expect(checkFiles([...appSources, ...packageSources], findRoleLogic)).toEqual([]);
    expect(findRoleLogic('bad-role.ts', fixture('bad-role.txt'))).toEqual([
      expect.objectContaining({ file: 'bad-role.ts', line: 1, detail: 'role.name' }),
      expect.objectContaining({ file: 'bad-role.ts', line: 2, detail: 'roleName' }),
      expect.objectContaining({ file: 'bad-role.ts', line: 3, detail: 'roleId ===' }),
      expect.objectContaining({ file: 'bad-role.ts', line: 4, detail: '.role?.name' }),
    ]);
  });

  it('rejects physical direction classes in web source', () => {
    expect(checkFiles(sourceFiles(join(root, 'apps/web/src')), findPhysicalClasses)).toEqual([]);
    expect(findPhysicalClasses('bad-class.tsx', fixture('bad-class.txt'))).toEqual([
      expect.objectContaining({ file: 'bad-class.tsx', line: 1, detail: 'ml-2' }),
      expect.objectContaining({ file: 'bad-class.tsx', line: 2, detail: 'text-right' }),
      expect.objectContaining({ file: 'bad-class.tsx', line: 2, detail: 'sm:border-l-2' }),
    ]);
  });

  it('keeps shared free of app, I/O and Prisma imports', () => {
    expect(checkFiles(sharedSources, findForbiddenSharedImports)).toEqual([]);
    expect(findForbiddenSharedImports('bad-import.ts', fixture('bad-import.txt'))).toEqual([
      expect.objectContaining({ file: 'bad-import.ts', line: 1, detail: 'node:fs' }),
      expect.objectContaining({ file: 'bad-import.ts', line: 2, detail: 'node:net' }),
      expect.objectContaining({ file: 'bad-import.ts', line: 3, detail: '@prisma/client' }),
      expect.objectContaining({ file: 'bad-import.ts', line: 4, detail: '../../../apps/api/src/app.js' }),
    ]);
  });
});
