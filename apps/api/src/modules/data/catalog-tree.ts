import {
  createCategory,
  createGroup,
  editCatalogNode,
} from '@purchasing-plus/shared';

import type { Context } from '../access/endpoint.js';
import type { Tx } from '../access/repo.js';
import { pathIds, siblings } from '../catalog-tree/repo.js';
import {
  createGroupNode,
  deactivateNode,
  editNode,
} from '../catalog-tree/service.js';

import * as repo from './repo.js';
import {
  activeCell,
  checkDuplicate,
  joinNames,
  matchName,
  normalizedName,
  splitNames,
  type Definition,
  type Row,
} from './schemas.js';

type Node = Awaited<ReturnType<typeof repo.nodes>>[number];

export async function pathLabels(tx: Tx) {
  const nodes = await repo.nodes(tx);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const label = (nodeId: number) =>
    joinNames(
      pathIds(byId.get(nodeId)!.path).map((id) => byId.get(id)!.name),
      '>',
    );
  return { nodes, label };
}

export async function pathResolver(ctx: Context) {
  const initial = new Map<number | null, Node[]>();
  for (const node of await repo.nodes(ctx.tx)) {
    const children = initial.get(node.parentId) ?? [];
    children.push(node);
    initial.set(node.parentId, children);
  }
  return (row: Row) => {
    const parts = splitNames(row.text('path'), '>');
    const [categoryName, ...groups] = parts;
    if (
      !categoryName ||
      parts.some((name) => !createGroup.shape.name.safeParse(name).success)
    ) {
      row.issue(
        'path',
        'مسار الفئة أو المجموعة غير صالح.',
        'اكتب أسماء مستويات المسار وافصل بينها بعلامة >.',
      );
      return;
    }
    const category = matchName(
      initial.get(null) ?? [],
      categoryName,
      ({ name }) => name,
    );
    if (!category) {
      row.issue('path', 'الفئة مش موجودة.', 'استخدم اسم فئة موجودة.');
      return;
    }
    let existing: Node | undefined = category;
    const identity: (string | number)[] = [category.id];
    for (const group of groups) {
      existing =
        existing &&
        matchName(initial.get(existing.id) ?? [], group, ({ name }) => name);
      identity.push(existing?.id ?? normalizedName(group));
    }
    const ensure = () =>
      existing
        ? Promise.resolve(existing)
        : createMissing(ctx, category, groups);
    return {
      category,
      groups,
      existing,
      ensure,
      identity: JSON.stringify(identity),
    };
  };
}

async function createMissing(ctx: Context, root: Node, groups: string[]) {
  let parent = root;
  for (const name of groups) {
    const group = matchName(
      await siblings(ctx.tx, parent.id),
      name,
      (node) => node.name,
    );
    parent =
      group ??
      (await createGroupNode(
        ctx,
        createGroup.parse({ name, parentId: parent.id }),
      ));
  }
  return parent;
}

export const catalogTree: Definition = {
  mainColumn: 'path',
  errorColumns: { PREFIX_IN_USE: 'codePrefix', CATEGORY_FIELDS: 'codePrefix' },
  example: {
    path: 'كهربا > مفاتيح وبرايز > سلسلة X',
    active: activeCell(true),
  },
  exportRows: async ({ tx }) => {
    const { nodes, label } = await pathLabels(tx);
    return nodes.map((node) => ({
      path: label(node.id),
      codePrefix: node.codePrefix ?? '',
      active: activeCell(node.isActive),
    }));
  },
  prepare: async (ctx) => {
    const resolve = await pathResolver(ctx);
    const seen = new Set<string | number>();
    return async (row) => {
      const isActive = row.active();
      const prefix = row.text('codePrefix');
      const path = resolve(row);
      if (!path) return;
      checkDuplicate(seen, path.identity, row, 'path');
      if (path.groups.length && prefix)
        row.issue(
          'codePrefix',
          'البادئة متاحة للفئة الرئيسية بس.',
          'سيب البادئة فاضية للمجموعات.',
        );
      if (prefix && !createCategory.shape.codePrefix.safeParse(prefix).success)
        row.issue(
          'codePrefix',
          'بادئة الكود غير صالحة.',
          'اكتب من حرفين إلى 5 حروف إنجليزية كبيرة.',
        );
      return {
        kind: path.existing ? 'update' : 'create',
        run: async () => {
          const node = await path.ensure();
          if (prefix && node.codePrefix !== prefix)
            await editNode(
              ctx,
              node.id,
              editCatalogNode.parse({ codePrefix: prefix }),
            );
          if (isActive === false && node.isActive)
            await deactivateNode(ctx, node.id);
          if (isActive === true && !node.isActive)
            await editNode(ctx, node.id, { isActive: true });
        },
      };
    };
  },
};
