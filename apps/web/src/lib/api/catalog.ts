import type {
  createCatalogItem,
  editCatalogItem,
  editCatalogItemInEditor,
  ImageCrop,
} from '@purchasing-plus/shared';

import { api } from './client.js';
import { recordPath, type RecordPage } from './records.js';

export interface NamedRecord {
  id: number;
  name: string;
  isActive: boolean;
}
export interface Folder extends NamedRecord {
  parentId: number | null;
  codePrefix: string | null;
  iconKey: string | null;
  path: string;
  childGroupCount: number;
  subtreeItemCount: number;
  coverThumbs: string[];
}
export interface CatalogNode extends Omit<
  Folder,
  'childGroupCount' | 'subtreeItemCount' | 'coverThumbs'
> {
  breadcrumb: NamedRecord[];
}
export interface AttributeOption {
  id: number;
  label: string;
  isActive: boolean;
}
export interface Attribute extends NamedRecord {
  type: 'TEXT' | 'NUMBER' | 'SELECT';
  unitLabel: string | null;
  clientVisible?: boolean;
  options: AttributeOption[];
}
export interface CatalogImage {
  id: number;
  thumbUrl: string;
  displayUrl: string;
  width: number;
  height: number;
  order: number;
  isCover: boolean;
  crop: ImageCrop | null;
}
export interface CatalogItem extends NamedRecord {
  code: string;
  description: string;
  nodeId: number;
  nodePath: NamedRecord[];
  unitId: number;
  unit: NamedRecord;
  attributeValues: {
    attributeId: number;
    attribute: Omit<Attribute, 'options'>;
    value: string | number;
    option: AttributeOption | null;
  }[];
  latestPrice?: {
    unitPrice: string;
    createdAt: string;
    supplier?: { id: number; name: string };
    requestNumber?: string | null;
  } | null;
  categoryIcon?: string | null;
  images?: CatalogImage[];
}
export interface FolderContents {
  node: CatalogNode;
  folders: Folder[];
  items: RecordPage<CatalogItem>;
}
interface EditorChoices {
  defaults: Attribute[];
  attributes: RecordPage<Attribute>;
  units: RecordPage<NamedRecord>;
}
const include = (manage: boolean) => (manage ? 'true' : undefined);
export const catalogApi = {
  categories: (manage: boolean, signal?: AbortSignal) =>
    api<Folder[]>(
      recordPath('/catalog/categories', { includeInactive: include(manage) }),
      { signal },
    ),
  folders: (id: number, manage: boolean, signal?: AbortSignal) =>
    api<Folder[]>(
      recordPath('/catalog/nodes/' + id + '/children', {
        includeInactive: include(manage),
      }),
      { signal },
    ),
  node: (id: number, manage: boolean, signal?: AbortSignal) =>
    api<CatalogNode>(
      recordPath('/catalog/nodes/' + id, { includeInactive: include(manage) }),
      { signal },
    ),
  items: (
    id: number,
    manage: boolean,
    page: number,
    signal?: AbortSignal,
    active?: string,
  ) =>
    api<RecordPage<CatalogItem>>(
      recordPath('/catalog/nodes/' + id + '/items', {
        includeInactive: include(manage),
        page,
        active,
      }),
      { signal },
    ),
  async folder(
    id: number,
    manage: boolean,
    signal?: AbortSignal,
  ): Promise<FolderContents> {
    const [node, folders, items] = await Promise.all([
      catalogApi.node(id, manage, signal),
      catalogApi.folders(id, manage, signal),
      catalogApi.items(id, manage, 1, signal),
    ]);
    return { node, folders, items };
  },
  item: (id: number, manage: boolean, signal?: AbortSignal) =>
    api<CatalogItem>(
      recordPath('/catalog/items/' + id, { includeInactive: include(manage) }),
      { signal },
    ),
  search: (
    categoryId: number,
    q: string,
    manage: boolean,
    page: number,
    signal?: AbortSignal,
    active?: string,
  ) =>
    api<RecordPage<CatalogItem>>(
      recordPath('/catalog/search', {
        categoryId,
        q,
        page,
        active,
        includeInactive: include(manage),
      }),
      { signal },
    ),
  async choices(nodeId: number, signal: AbortSignal) {
    const path = '/catalog/nodes/' + nodeId + '/editor-choices';
    const read = (page: number) =>
      api<EditorChoices>(recordPath(path, { page, pageSize: 100 }), { signal });
    const first = await read(1);
    const attributes = [...first.attributes.items];
    const units = [...first.units.items];
    const pages = Math.max(
      Math.ceil(first.attributes.total / first.attributes.pageSize),
      Math.ceil(first.units.total / first.units.pageSize),
    );
    for (let page = 2; page <= pages; page++) {
      const next = await read(page);
      attributes.push(...next.attributes.items);
      units.push(...next.units.items);
    }
    return { defaults: first.defaults, attributes, units };
  },
  create: (body: ReturnType<typeof createCatalogItem.parse>) =>
    api<CatalogItem>('/catalog/items', { method: 'POST', body }),
  edit: (id: number, body: ReturnType<typeof editCatalogItem.parse>) =>
    api<CatalogItem>('/catalog/items/' + id, { method: 'PATCH', body }),
  saveEditor: (
    id: number,
    body: ReturnType<typeof editCatalogItemInEditor.parse>,
  ) =>
    api<CatalogItem>('/catalog/items/' + id + '/editor', {
      method: 'PATCH',
      body,
    }),
  move: (id: number, nodeId: number) =>
    api<CatalogItem>('/catalog/items/' + id + '/move', {
      method: 'POST',
      body: { nodeId },
    }),
  deactivate: (id: number) =>
    api<CatalogItem>('/catalog/items/' + id, { method: 'DELETE' }),
};
