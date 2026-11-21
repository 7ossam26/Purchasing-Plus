import { normalizeArabic, type DataIssue } from '@purchasing-plus/shared';
import { dataUi } from '@purchasing-plus/shared/i18n/ar';
import type { ZodType } from 'zod';

import { AppError } from '../../middleware/errors.js';
import type { Context } from '../access/endpoint.js';
import type { Tx } from '../access/repo.js';

import type { Cells, FileRow } from './files.js';

export type Change = {
  kind: 'create' | 'update';
  run: () => Promise<unknown>;
};
export interface Definition {
  example: Cells;
  exportRows: (ctx: Context) => Promise<Cells[]>;
  prepare: (ctx: Context) => Promise<(row: Row) => Promise<Change | undefined>>;
  errorColumns?: Record<string, string>;
  mainColumn: string;
}

export class Row {
  constructor(
    private readonly fileRow: FileRow,
    private readonly errors: DataIssue[],
  ) {}
  get number() {
    return this.fileRow.number;
  }
  text(key: string) {
    return this.fileRow.cells[key] ?? '';
  }
  issue(
    column: string,
    message: string,
    fix = 'راجع القيمة في النموذج وعدّلها.',
  ) {
    this.errors.push({ row: this.number, column, message, fix });
  }
  active() {
    const text = this.text('active').toLowerCase();
    if (!text) return undefined;
    if ([dataUi.yes, 'true', '1'].includes(text)) return true;
    if ([dataUi.no, 'false', '0'].includes(text)) return false;
    this.issue('active', 'حالة النشاط غير صالحة.', 'اكتب نعم أو لا.');
    return undefined;
  }
  parse<T>(
    schema: ZodType<T>,
    input: unknown,
    columns: Record<string, string> = {},
    fallback = 'name',
  ) {
    const parsed = schema.safeParse(input);
    if (parsed.success) return parsed.data;
    for (const key of new Set(
      parsed.error.issues.map(({ path }) => String(path[0] ?? fallback)),
    )) {
      this.issue(columns[key] ?? key, 'القيمة غير صالحة.');
    }
    return undefined;
  }
  serviceError(error: AppError, column: string) {
    this.issue(column, error.message, error.fixAr);
  }
  check<T>(column: string, validate: () => T) {
    try {
      return validate();
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      this.serviceError(error, column);
      return undefined;
    }
  }
}

export const activeCell = (value: boolean) => (value ? dataUi.yes : dataUi.no);
export const normalizedName = (value: string) =>
  normalizeArabic(value).toLowerCase();

function uniqueMatch<T>(matches: readonly T[]) {
  if (matches.length > 1)
    throw new AppError(
      422,
      'AMBIGUOUS_NAME',
      'الاسم مطابق لأكتر من سجل.',
      'استخدم اسم فريد في إدارة البيانات.',
    );
  return matches[0];
}

export function matchName<T>(
  candidates: readonly T[],
  value: string,
  name: (candidate: T) => string,
) {
  const exact = candidates.filter((entry) => name(entry) === value);
  const matches = exact.length
    ? exact
    : candidates.filter(
        (entry) => normalizedName(name(entry)) === normalizedName(value),
      );
  return uniqueMatch(matches);
}

export function namedRows<T extends { id: number; name: string }>(
  read: (tx: Tx) => Promise<T[]>,
) {
  return async (tx: Tx) => {
    const entries = await read(tx);
    function index(key: (name: string) => string) {
      const byName = new Map<string, T[]>();
      for (const entry of entries) {
        const name = key(entry.name);
        const matches = byName.get(name);
        if (matches) matches.push(entry);
        else byName.set(name, [entry]);
      }
      return byName;
    }
    const byNormalized = index(normalizedName);
    const byExact = index((name) => name);
    return (value: string) =>
      uniqueMatch(
        byExact.get(value) ?? byNormalized.get(normalizedName(value)) ?? [],
      );
  };
}

export function checkDuplicate(
  seen: Set<string | number>,
  key: string | number,
  row: Row,
  column: string,
) {
  if (seen.has(key)) {
    row.issue(column, 'القيمة مكررة في الملف.', 'اكتب القيمة مرة واحدة بس.');
    return true;
  }
  seen.add(key);
  return false;
}

type Separator = '>' | '،';
export function splitNames(text: string, separator: Separator) {
  if (!text) return [];
  const names: string[] = [];
  let name = '';
  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index);
    const next = text[index + 1];
    if (char === '\\' && (next === '\\' || next === separator)) {
      name += next;
      index++;
    } else if (char === separator) {
      names.push(name);
      name = '';
    } else name += char;
  }
  names.push(name);
  return names.map((name) => name.trim());
}
export function joinNames(names: string[], separator: Separator) {
  return names
    .map((name) =>
      name.replaceAll('\\', '\\\\').replaceAll(separator, '\\' + separator),
    )
    .join(separator === '>' ? ' > ' : '، ');
}
