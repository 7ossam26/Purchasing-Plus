import { ar, type RequestLineInput } from '@purchasing-plus/shared';
import type {
  ActionInput,
  LineData,
  RequestItem,
  RequestState,
} from '@purchasing-plus/shared/lifecycle';

import { AppError } from '../../middleware/errors.js';
import type { Tx } from '../access/repo.js';
import { findItemsByIds, itemValue } from '../catalog/repo.js';
import { breadcrumbs } from '../catalog-tree/repo.js';

import { findLineNodes, findLineUnits, reserveIds } from './repo.js';

export const invalidLine = () =>
  new AppError(422, 'INVALID_REQUEST_LINE', ar.requests.invalidLine);

async function catalogEntries(tx: Tx, ids: number[]) {
  const rows = await findItemsByIds(tx, ids);
  const crumbs = await breadcrumbs(
    tx,
    rows.map((row) => row.node.path),
  );
  return new Map(
    rows.map((row) => {
      const path = crumbs(row.node.path);
      return [
        row.id,
        {
          categoryId: path[0]!.id,
          active:
            row.isActive &&
            row.unit.isActive &&
            path.every((node) => node.isActive),
          nodeId: row.nodeId,
          unitId: row.unitId,
          snapshot: {
            code: row.code,
            name: row.name,
            unitName: row.unit.name,
            attributes: Object.fromEntries(
              row.attributeValues.map((attr) => [
                attr.attribute.name,
                attr.option?.label ?? String(itemValue(attr)),
              ]),
            ),
            nodePath: path.map((node) => node.name),
            coverImageKey:
              row.images.find((image) => image.isCover)?.displayKey ?? null,
          },
        },
      ] as const;
    }),
  );
}

export async function hydrateLines(
  tx: Tx,
  categoryId: number,
  lines: RequestLineInput[],
  prior: RequestState['items'] = [],
) {
  const catalog = await catalogEntries(
    tx,
    lines.flatMap((line) => (line.catalogItemId ? [line.catalogItemId] : [])),
  );
  const other = lines.filter((line) => 'otherName' in line);
  const nodes = await findLineNodes(
    tx,
    other.map((line) => line.nodeId),
  );
  const units = await findLineUnits(
    tx,
    lines.flatMap((line) => (line.unitId === undefined ? [] : [line.unitId])),
  );
  const paths = await breadcrumbs(
    tx,
    nodes.map((node) => node.path),
  );
  const old = new Map(
    prior
      .filter((item) => item.state !== 'REMOVED')
      .map((item) => [item.id, item]),
  );
  const seen = new Set<number>();
  const fresh = await reserveIds(
    tx,
    'RequestItem',
    lines.filter((line) => line.id === undefined).length,
  );
  let offset = 0;
  return lines.map((line): LineData => {
    const { quantity, specs } = line;
    const id = line.id ?? fresh[offset++]!;
    const previous = old.get(id);
    if (line.id !== undefined && (!previous || seen.has(id)))
      throw invalidLine();
    seen.add(id);
    if (!('otherName' in line)) {
      const entry = catalog.get(line.catalogItemId);
      if (!entry?.active || entry.categoryId !== categoryId)
        throw invalidLine();
      const unit =
        line.unitId === undefined
          ? undefined
          : units.find((unit) => unit.id === line.unitId);
      if (line.unitId !== undefined && !unit?.isActive) throw invalidLine();
      return {
        id,
        catalogItemId: line.catalogItemId,
        unitId: unit?.id ?? entry.unitId,
        nodeId: entry.nodeId,
        otherName: null,
        specs,
        quantity,
        snapshot: {
          ...entry.snapshot,
          unitName: unit?.name ?? entry.snapshot.unitName,
        },
      };
    }
    const node = nodes.find((node) => node.id === line.nodeId);
    const unit = units.find((unit) => unit.id === line.unitId);
    const path = node ? paths(node.path) : [];
    if (
      !unit?.isActive ||
      path[0]?.id !== categoryId ||
      path.some((node) => !node.isActive)
    )
      throw invalidLine();
    return {
      id,
      catalogItemId: null,
      nodeId: line.nodeId,
      unitId: line.unitId,
      otherName: line.otherName,
      quantity,
      specs,
      snapshot: {
        name: line.otherName,
        code: null,
        unitName: unit.name,
        attributes: {},
        nodePath: path.map((node) => node.name),
        coverImageKey: null,
      },
    };
  });
}

export async function snapshotForSubmit(tx: Tx, state: RequestState) {
  const items = await hydrateLines(
    tx,
    state.categoryId,
    state.items.map((item) =>
      item.catalogItemId === null
        ? {
            id: item.id,
            quantity: item.quantity,
            specs: item.specs,
            nodeId: item.nodeId,
            unitId: item.unitId,
            otherName: item.otherName!,
          }
        : {
            id: item.id,
            quantity: item.quantity,
            specs: item.specs,
            catalogItemId: item.catalogItemId,
            unitId: item.unitId,
          },
    ),
    state.items,
  );
  return {
    ...state,
    items: state.items.map((item, index) => ({ ...item, ...items[index]! })),
  };
}

export async function forCopy(
  tx: Tx,
  categoryId: number,
  selected: RequestItem[],
): Promise<ActionInput<'copyRequest'>['lines']> {
  const catalog = await catalogEntries(
    tx,
    selected.flatMap((item) =>
      item.catalogItemId === null ? [] : [item.catalogItemId],
    ),
  );
  const ids = await reserveIds(tx, 'RequestItem', selected.length);
  return selected.map((item, index) => {
    const entry =
      item.catalogItemId === null ? undefined : catalog.get(item.catalogItemId);
    const current =
      entry?.categoryId === categoryId
        ? {
            active: entry.active,
            nodeId: entry.nodeId,
            unitId: entry.unitId,
            snapshot: entry.snapshot,
          }
        : null;
    return { sourceItemId: item.id, newItemId: ids[index]!, current };
  });
}

export function lineChanges(state: RequestState, lines: LineData[]) {
  const live = state.items.filter((item) => item.state !== 'REMOVED');
  const currentIds = new Set(lines.map((line) => line.id));
  const previousIds = new Set(live.map((line) => line.id));
  return {
    remove: live
      .filter((item) => !currentIds.has(item.id))
      .map((item) => item.id),
    add: lines.filter((line) => !previousIds.has(line.id)),
    change: lines
      .filter((line) => previousIds.has(line.id))
      .map(({ id, ...fields }) => ({ itemId: id, fields })),
  };
}
