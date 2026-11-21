import { z } from 'zod';

import { dataUi } from './i18n/ar.js';

export const dataEntity = z.enum([
  'units',
  'sites',
  'attributes',
  'catalog-tree',
  'catalog-items',
  'suppliers',
]);
export type DataEntity = z.infer<typeof dataEntity>;
export const maxDataFileBytes = 10 * 1024 * 1024;
export const attributePairNumbers = Array.from({ length: 15 }, (_, i) => i + 1);

export const dataColumns = {
  units: ['name', 'active'],
  sites: ['name', 'address', 'active'],
  attributes: ['name', 'type', 'unitLabel', 'options', 'active'],
  'catalog-tree': ['path', 'codePrefix', 'active'],
  'catalog-items': [
    'code',
    'name',
    'path',
    'unit',
    'description',
    'active',
    ...attributePairNumbers.flatMap((n) => [`attribute${n}`, `value${n}`]),
  ],
  suppliers: [
    'name',
    'contactPerson',
    'whatsappNumber',
    'categories',
    'active',
    'notes',
  ],
} satisfies Record<DataEntity, readonly string[]>;

export function dataColumnLabel(key: string): string {
  const pair = /^(attribute|value)(\d+)$/.exec(key);
  if (pair)
    return (
      (pair[1] === 'attribute' ? dataUi.attribute : dataUi.value) +
      ' ' +
      pair[2]
    );
  return (
    dataUi.columns[key as keyof typeof dataUi.columns] ??
    (/^[A-Z]{1,3}$/.test(key) ? key : dataUi.file)
  );
}

export interface DataIssue {
  row: number;
  column: string;
  message: string;
  fix: string;
}

export interface DataPreview {
  create: number;
  update: number;
  errors: DataIssue[];
}
