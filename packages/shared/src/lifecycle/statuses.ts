import { ar } from '../i18n/ar.js';

const l = ar.statuses;
export type StatusTone =
  | 'neutral'
  | 'primary'
  | 'pending'
  | 'info'
  | 'distinct'
  | 'success'
  | 'danger';
export type StatusGlyph =
  | 'file'
  | 'clock'
  | 'rotate'
  | 'cart'
  | 'pause'
  | 'truck'
  | 'check'
  | 'x'
  | 'alert'
  | 'dot'
  | 'box';
const status = (label: string, tone: StatusTone, glyph: StatusGlyph) => ({
  label,
  tone,
  glyph,
});

export const statusMap = {
  DRAFT: status(l.draft, 'neutral', 'file'),
  AWAITING_MANAGER: status(l.awaitingManager, 'pending', 'clock'),
  RETURNED: status(l.returned, 'distinct', 'rotate'),
  AT_PURCHASING: status(l.purchasing, 'info', 'cart'),
  PAUSED: status(l.paused, 'distinct', 'pause'),
  FULFILMENT: status(l.fulfilment, 'info', 'truck'),
  AWAITING_APPROVAL: status(l.awaitingApproval, 'pending', 'clock'),
  AWAITING_RECEIPT: status(l.awaitingReceipt, 'info', 'truck'),
  REMAINING: status(l.remaining, 'distinct', 'box'),
  COMPLETED: status(l.completed, 'success', 'check'),
  REJECTED: status(l.rejected, 'danger', 'x'),
  CANCELLED: status(l.cancelled, 'danger', 'x'),
  OPEN: status(l.open, 'neutral', 'dot'),
  UNAVAILABLE: status(l.unavailable, 'distinct', 'box'),
  RECEIVED: status(l.received, 'success', 'check'),
  RESOLVED_EXTERNALLY: status(l.external, 'success', 'check'),
  REMOVED: status(l.removed, 'neutral', 'x'),
  APPROVED: status(l.approved, 'success', 'check'),
  NORMAL: status(l.normal, 'neutral', 'dot'),
  URGENT: status(l.urgent, 'pending', 'alert'),
  VERY_URGENT: status(l.veryUrgent, 'danger', 'alert'),
  OVERDUE: status(l.overdue, 'danger', 'alert'),
  CURRENT: status(l.current, 'primary', 'dot'),
} as const;
export type DisplayStatus = keyof typeof statusMap;
