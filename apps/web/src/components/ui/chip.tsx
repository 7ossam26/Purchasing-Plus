import { formatNumber } from '@purchasing-plus/shared';
import {
  statusMap,
  type DisplayStatus,
  type StatusTone,
} from '@purchasing-plus/shared/lifecycle';
import {
  AlertCircle,
  Circle,
  Clock,
  FileText,
  Package,
  Pause,
  RotateCcw,
  ShoppingCart,
  Truck,
  X,
  Check,
} from 'lucide-react';
import type { ReactNode } from 'react';

const tones: Record<StatusTone, string> = {
  neutral: 'bg-neutral-bg text-neutral-fg',
  primary: 'bg-ink text-paper',
  pending: 'bg-pending-bg text-pending-fg',
  info: 'bg-info-bg text-info-fg',
  distinct: 'bg-distinct-bg text-distinct-fg',
  success: 'bg-ppr-wash text-ppr-deep',
  danger: 'bg-danger-bg text-danger-fg',
};
const glyphs = {
  file: FileText,
  clock: Clock,
  rotate: RotateCcw,
  cart: ShoppingCart,
  pause: Pause,
  truck: Truck,
  check: Check,
  x: X,
  alert: AlertCircle,
  dot: Circle,
  box: Package,
};
export function Chip({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode;
  tone?: StatusTone;
  icon?: ReactNode;
}) {
  return (
    <span
      className={`inline-flex w-fit max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-micro ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}
export function StatusChip({
  status,
  count,
}: {
  status: DisplayStatus;
  count?: number;
}) {
  const { tone, label, glyph } = statusMap[status];
  const Icon = glyphs[glyph];
  return (
    <Chip
      tone={tone}
      icon={
        <Icon
          className="shrink-0"
          size={14}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      }
    >
      {count !== undefined && (
        <bdi className="numeric">{formatNumber(count)}</bdi>
      )}
      {label}
    </Chip>
  );
}
