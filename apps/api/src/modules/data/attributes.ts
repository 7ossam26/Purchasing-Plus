import {
  createAttribute,
  createAttributeOption,
  editAttribute,
} from '@purchasing-plus/shared';
import { dataUi } from '@purchasing-plus/shared/i18n/ar';

import type { Context } from '../access/endpoint.js';
import {
  addAttribute,
  addOption,
  deactivateAttribute,
  reorderOptions,
  updateAttribute,
  updateOption,
} from '../attributes/service.js';

import * as repo from './repo.js';
import {
  activeCell,
  checkDuplicate,
  joinNames,
  namedRows,
  normalizedName,
  splitNames,
  type Definition,
} from './schemas.js';

const types = {
  TEXT: dataUi.text,
  NUMBER: dataUi.number,
  SELECT: dataUi.select,
} as const;
type Attribute = Awaited<ReturnType<typeof repo.attributes>>[number];

async function updateOptions(
  ctx: Context,
  attribute: Attribute,
  labels: string[],
) {
  const byLabel = new Map(
    attribute.options.map((option) => [option.label, option]),
  );
  const ids: number[] = [];
  for (const label of labels) {
    const option =
      byLabel.get(label) ?? (await addOption(ctx, attribute.id, label));
    if (!option.isActive)
      await updateOption(ctx, attribute.id, option.id, { isActive: true });
    ids.push(option.id);
    byLabel.delete(label);
  }
  for (const option of byLabel.values()) {
    if (option.isActive)
      await updateOption(ctx, attribute.id, option.id, { isActive: false });
    ids.push(option.id);
  }
  const before = attribute.options.map(({ id }) => id);
  if (ids.some((id, index) => before[index] !== id))
    await reorderOptions(ctx, attribute.id, ids);
}

export const attributes: Definition = {
  mainColumn: 'name',
  errorColumns: {
    ATTRIBUTE_TYPE_IN_USE: 'type',
    UNIT_LABEL_NOT_ALLOWED: 'unitLabel',
    OPTIONS_NOT_ALLOWED: 'options',
  },
  example: {
    name: 'اللون',
    type: dataUi.select,
    options: 'أبيض، أسود',
    active: activeCell(true),
  },
  exportRows: async ({ tx }) =>
    (await repo.attributes(tx)).map((attribute) => ({
      name: attribute.name,
      type: types[attribute.type],
      unitLabel: attribute.unitLabel ?? '',
      options: joinNames(
        attribute.options
          .filter(({ isActive }) => isActive)
          .map(({ label }) => label),
        '،',
      ),
      active: activeCell(attribute.isActive),
    })),
  prepare: async (ctx) => {
    const match = await namedRows(repo.attributes)(ctx.tx);
    const seen = new Set<string | number>();
    return async (row) => {
      const name = row.text('name');
      const isActive = row.active();
      const typeText = row.text('type');
      const type = (Object.keys(types) as (keyof typeof types)[]).find(
        (key) => types[key] === typeText || key === typeText,
      );
      const unitLabel = row.text('unitLabel');
      const optionsText = row.text('options');
      const options = splitNames(optionsText, '،');
      if (!type)
        row.issue('type', 'نوع الخاصية غير صالح.', 'اكتب نص أو رقم أو اختيار.');
      if (type && type !== 'NUMBER' && unitLabel)
        row.issue(
          'unitLabel',
          'رمز الوحدة متاح للخصائص الرقمية فقط.',
          'سيب رمز الوحدة فاضي.',
        );
      if (type && type !== 'SELECT' && optionsText)
        row.issue(
          'options',
          'الخيارات متاحة لخصائص الاختيار فقط.',
          'سيب الخيارات فاضية.',
        );
      if (!type) return;
      for (const label of options)
        row.parse(createAttributeOption, { label }, { label: 'options' });
      const input = row.parse(createAttribute, {
        name,
        type,
        ...(type === 'NUMBER' ? { unitLabel: unitLabel || null } : {}),
        ...(type === 'SELECT' ? { options } : {}),
      });
      if (!input) return;
      const existing = match(name);
      checkDuplicate(seen, existing?.id ?? normalizedName(name), row, 'name');
      const edit = row.parse(editAttribute, {
        type,
        unitLabel: unitLabel || null,
        isActive: isActive === true ? true : undefined,
      });
      if (!edit) return;
      return {
        kind: existing ? 'update' : 'create',
        run: async () => {
          const attribute = existing
            ? await updateAttribute(ctx, existing.id, edit)
            : await addAttribute(ctx, input);
          if (existing && type === 'SELECT')
            await updateOptions(ctx, attribute, options);
          if (isActive === false && attribute.isActive)
            await deactivateAttribute(ctx, attribute.id);
        },
      };
    };
  },
};
