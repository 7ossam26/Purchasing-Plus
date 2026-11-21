import {
  attributePairNumbers,
  createCatalogItem,
  editCatalogItemInEditor,
} from '@purchasing-plus/shared';

import { findItem, itemValue, type ItemRecord } from '../catalog/repo.js';
import {
  addItem,
  assertAvailableUnit,
  assertSameCategory,
  editItem,
  validateItemValue,
} from '../catalog/service.js';

import { pathLabels, pathResolver } from './catalog-tree.js';
import * as repo from './repo.js';
import {
  activeCell,
  checkDuplicate,
  matchName,
  namedRows,
  type Definition,
  type Row,
} from './schemas.js';

type Attribute = Awaited<ReturnType<typeof repo.attributes>>[number];
type AttributeMatch = (name: string) => Attribute | undefined;
type AttributeValue = ReturnType<
  typeof createCatalogItem.parse
>['attributeValues'][number];
const itemFields = createCatalogItem.pick({ name: true, description: true });

function attributeValues(
  row: Row,
  match: AttributeMatch,
  existing?: ItemRecord,
) {
  const values: AttributeValue[] = [];
  const seen = new Set<string | number>();
  const previous = new Map(
    existing?.attributeValues.map((value) => [
      value.attributeId,
      itemValue(value),
    ]),
  );
  for (const n of attributePairNumbers) {
    const nameKey = `attribute${n}`;
    const valueKey = `value${n}`;
    const name = row.text(nameKey);
    const text = row.text(valueKey);
    if (!name && !text) continue;
    if (!name) {
      row.issue(nameKey, 'اسم الخاصية مطلوب.', 'اكتب اسم خاصية موجودة.');
      continue;
    }
    const definition = row.check(nameKey, () => match(name) ?? null);
    if (!definition) {
      if (definition === null)
        row.issue(nameKey, 'الخاصية مش موجودة.', 'اكتب اسم خاصية موجودة.');
      continue;
    }
    const duplicate = checkDuplicate(seen, definition.id, row, nameKey);
    const value =
      definition.type === 'SELECT'
        ? row.check(
            valueKey,
            () =>
              matchName(definition.options, text, ({ label }) => label)?.id ??
              0,
          )
        : text;
    if (value === undefined) continue;
    const input = { attributeId: definition.id, value };
    const priorValue = previous.get(definition.id);
    const column =
      !definition.isActive && priorValue !== value ? nameKey : valueKey;
    const validated = row.check(column, () =>
      validateItemValue(definition, input, priorValue),
    );
    if (validated && !duplicate) {
      const parsed = row.parse(
        createCatalogItem.shape.attributeValues,
        [input],
        { 0: valueKey },
        valueKey,
      );
      if (parsed) values.push(input);
    }
  }
  for (const entry of existing?.attributeValues.slice(
    attributePairNumbers.length,
  ) ?? []) {
    if (!seen.has(entry.attributeId))
      values.push({ attributeId: entry.attributeId, value: itemValue(entry) });
  }
  return values;
}

export const catalogItems: Definition = {
  mainColumn: 'code',
  errorColumns: {
    INVALID_UNIT: 'unit',
    INACTIVE_NODE: 'path',
    CROSS_CATEGORY_MOVE: 'path',
  },
  example: {
    name: 'مفتاح',
    path: 'كهربا > مفاتيح وبرايز',
    unit: 'قطعة',
    active: activeCell(true),
  },
  exportRows: async ({ tx }) => {
    const { label } = await pathLabels(tx);
    return (await repo.items(tx)).map((item) => ({
      code: item.code,
      name: item.name,
      path: label(item.nodeId),
      unit: item.unit.name,
      description: item.description,
      active: activeCell(item.isActive),
      ...Object.fromEntries(
        item.attributeValues
          .slice(0, attributePairNumbers.length)
          .flatMap((value, index) => [
            [`attribute${index + 1}`, value.attribute.name],
            [
              `value${index + 1}`,
              value.option?.label ??
                value.numberValue?.toFixed() ??
                value.textValue ??
                '',
            ],
          ]),
      ),
    }));
  },
  prepare: async (ctx) => {
    const { tx } = ctx;
    const codes = new Map(
      (await repo.itemCodes(tx)).map((item) => [item.code, item]),
    );
    const unitMatch = await namedRows(repo.units)(tx);
    const attributeMatch = await namedRows(repo.attributes)(tx);
    const resolve = await pathResolver(ctx);
    const seen = new Set<string | number>();
    return async (row) => {
      const code = row.text('code');
      const existing = code ? codes.get(code) : undefined;
      if (code) {
        checkDuplicate(seen, code, row, 'code');
        if (!existing)
          row.issue(
            'code',
            'كود الصنف مش موجود.',
            'استخدم كود صنف موجود أو سيب الكود فاضي لصنف جديد.',
          );
      }
      const prior = existing ? await findItem(tx, existing.id) : undefined;
      const unit = row.check('unit', () => unitMatch(row.text('unit')) ?? null);
      if (unit === null || (unit && unit.id !== prior?.unit.id))
        row.check('unit', () => assertAvailableUnit(unit));
      const path = row.check('path', () => resolve(row));
      if (path && prior)
        row.check('path', () =>
          assertSameCategory(prior.node.path, path.category.path),
        );
      const isActive = row.active();
      const values = attributeValues(row, attributeMatch, prior);
      const fields = row.parse(itemFields, {
        name: row.text('name'),
        description: row.text('description'),
      });
      if (!fields || !path || !unit) return;
      return {
        kind: existing ? 'update' : 'create',
        run: async () => {
          const node = await path.ensure();
          const input = {
            ...fields,
            nodeId: node.id,
            unitId: unit.id,
            attributeValues: values,
          };
          if (existing) {
            const edit = editCatalogItemInEditor.parse({
              ...input,
              isActive,
            });
            return editItem(ctx, existing.id, edit, 'data.import');
          }
          const create = createCatalogItem.parse({
            ...input,
            isActive: isActive === false ? false : undefined,
          });
          return addItem(ctx, create, 'data.import');
        },
      };
    };
  },
};
