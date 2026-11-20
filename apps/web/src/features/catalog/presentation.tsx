import { formatNumber } from '@purchasing-plus/shared';
import { masterData as copy } from '@purchasing-plus/shared/i18n/ar';
import {
  DoorOpen,
  Droplet,
  Folder as FolderIcon,
  Grid2X2,
  Package,
  PaintRoller,
  Zap,
} from 'lucide-react';

import { Chip } from '../../components/ui/chip.js';
import type { CatalogItem, NamedRecord } from '../../lib/api/catalog.js';

const icons = {
  zap: Zap,
  droplet: Droplet,
  'grid-2x2': Grid2X2,
  'paint-roller': PaintRoller,
  'door-open': DoorOpen,
  folder: FolderIcon,
};
export const categoryIcons = Object.keys(icons) as (keyof typeof icons)[];
export function CategoryIcon({
  name,
  size = 22,
}: {
  name?: string | null;
  size?: number;
}) {
  const Icon = icons[name as keyof typeof icons] ?? FolderIcon;
  return <Icon size={size} aria-hidden="true" strokeWidth={1.75} />;
}
export const nodeUrl = (id: number) => '/catalog/node/' + id;
export const itemUrl = (id: number) => '/catalog/item/' + id;
export const pathLabel = (path: readonly NamedRecord[]) =>
  path.map(({ name }) => name).join(copy.pathSeparator);

export function Stopped({ active }: { active: boolean }) {
  return active ? null : <Chip>{copy.stopped}</Chip>;
}
export function attributeLabel({
  value,
  attribute,
  option,
}: CatalogItem['attributeValues'][number]) {
  if (option) return option.label;
  if (attribute.type !== 'NUMBER') return String(value);
  return (
    formatNumber(value) + (attribute.unitLabel ? ' ' + attribute.unitLabel : '')
  );
}
export function SamplePlaceholder({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="catalog-swatch grid aspect-square place-items-center rounded-thumbnail border border-seam bg-plaster text-concrete"
    >
      <Package size={large ? 46 : 31} strokeWidth={1.25} />
    </span>
  );
}
