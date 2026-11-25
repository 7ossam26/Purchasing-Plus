import { ar } from '@purchasing-plus/shared/i18n/ar';
import { ArrowLeft, House } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Outlet } from 'react-router';

import { Button, buttonClass } from '../../components/ui/button.js';
import { Logo } from '../../components/ui/logo.js';
import { NotificationBell } from '../../features/inbox/bell.js';
import { useBack } from '../navigation.js';
import { useCan } from '../session.js';

import { AccountMenu } from './account-menu.js';

export function TopBar({
  navigation,
  notificationSlot,
}: {
  navigation?: ReactNode;
  notificationSlot?: ReactNode;
}) {
  const back = useBack();
  const canViewRequests = useCan('requests.view');
  return (
    <header className="fixed start-0 end-0 top-0 z-30 border-b border-seam bg-paper">
      <div className="mx-auto grid h-topbar max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 px-2 sm:gap-3 sm:px-6">
        <div className="flex items-center">
          {navigation}
          <Button
            iconOnly
            variant="ghost"
            aria-label={ar.common.back}
            onClick={back}
          >
            <ArrowLeft
              size={24}
              className="rtl-mirror"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span className="hidden lg:inline">{ar.common.back}</span>
          </Button>
          <Link
            to="/"
            className={
              buttonClass('ghost', true) + (navigation ? ' max-sm:hidden' : '')
            }
            aria-label={ar.common.home}
          >
            <House size={24} strokeWidth={1.75} aria-hidden="true" />
            <span className="hidden lg:inline">{ar.common.home}</span>
          </Link>
        </div>
        <Link
          to="/"
          className="inline-flex min-h-target items-center rounded-control px-2"
          aria-label={`${ar.common.home} – ${ar.brandName} ${ar.appName}`}
        >
          <Logo product="wide" />
        </Link>
        <div className="flex items-center justify-self-end">
          {notificationSlot ?? (canViewRequests && <NotificationBell />)}
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
export function StandardShell({
  notificationSlot,
  children,
}: {
  notificationSlot?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="min-h-dvh pt-topbar">
      <TopBar notificationSlot={notificationSlot} />
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
