import { ar } from '@purchasing-plus/shared/i18n/ar';
import { Ellipsis } from 'lucide-react';
import { useState } from 'react';

import { Button, type ButtonVariant } from '../ui/button.js';
import { Modal } from '../ui/modal.js';

export interface BarAction {
  id: string;
  label: string;
  onClick: () => void;
  loading?: boolean;
  reason?: string;
  variant?: ButtonVariant;
}
function Action({
  action,
  variant,
  fullWidth,
}: {
  action: BarAction;
  variant: ButtonVariant;
  fullWidth?: boolean;
}) {
  return (
    <div className={`grid gap-1 ${fullWidth ? 'w-full sm:w-auto' : ''}`}>
      <Button
        variant={action.variant ?? variant}
        loading={action.loading}
        disabled={Boolean(action.reason)}
        onClick={action.onClick}
      >
        {action.label}
      </Button>
      {action.reason && (
        <p className="text-small text-concrete">{action.reason}</p>
      )}
    </div>
  );
}
export function ActionBar({
  primary,
  secondary = [],
  overflow = [],
  stickyOnDesktop = false,
  sticky = true,
  fullWidthPrimary = false,
}: {
  primary?: BarAction;
  secondary?: readonly BarAction[];
  overflow?: readonly BarAction[];
  stickyOnDesktop?: boolean;
  sticky?: boolean;
  fullWidthPrimary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!primary && !secondary.length && !overflow.length) return null;
  return (
    <div
      className={`flex flex-wrap items-start gap-2 border-y border-seam bg-paper p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:rounded-panel sm:border ${sticky ? `sticky bottom-0 z-20 ${stickyOnDesktop ? '' : 'sm:static'}` : ''}`}
    >
      {primary && (
        <Action
          action={primary}
          variant="primary"
          fullWidth={fullWidthPrimary}
        />
      )}
      {secondary.map((action) => (
        <Action key={action.id} action={action} variant="secondary" />
      ))}
      {overflow.length > 0 && (
        <Button
          variant="ghost"
          iconOnly
          aria-label={ar.common.more}
          onClick={() => setOpen(true)}
        >
          <Ellipsis size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="hidden sm:inline">{ar.common.more}</span>
        </Button>
      )}
      <Modal open={open} title={ar.common.more} onClose={() => setOpen(false)}>
        <div className="grid gap-2">
          {overflow.map((action) => (
            <Action
              key={action.id}
              variant="secondary"
              action={{
                ...action,
                onClick: () => {
                  setOpen(false);
                  action.onClick();
                },
              }}
            />
          ))}
        </div>
      </Modal>
    </div>
  );
}
