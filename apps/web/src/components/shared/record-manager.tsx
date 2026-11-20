import { ar } from '@purchasing-plus/shared/i18n/ar';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

import { buttonClass } from '../ui/button.js';

import { ActionBar, type BarAction } from './action-bar.js';

export function RecordManager({
  title,
  parent = '/',
  add,
  children,
}: {
  title: string;
  parent?: string;
  add?: BarAction;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    function close(event: KeyboardEvent) {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('dialog[open]')
      ) {
        void navigate(parent);
      }
    }
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [navigate, parent]);
  return (
    <section className="grid gap-4 rounded-panel border border-seam bg-paper p-3 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-title">{title}</h1>
        <Link
          to={parent}
          aria-label={ar.common.close}
          className={buttonClass('ghost', true)}
        >
          <X size={20} aria-hidden="true" />
        </Link>
      </header>
      {children}
      <ActionBar
        primary={add}
        secondary={[
          {
            id: 'close',
            label: ar.common.close,
            onClick: () => void navigate(parent),
          },
        ]}
      />
    </section>
  );
}
