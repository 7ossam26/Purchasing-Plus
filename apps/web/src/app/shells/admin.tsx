import { ar } from '@purchasing-plus/shared/i18n/ar';
import { modules } from '@purchasing-plus/shared/permissions';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';

import { Button } from '../../components/ui/button.js';
import { Logo } from '../../components/ui/logo.js';
import { Modal } from '../../components/ui/modal.js';
import { ModuleIcon } from '../module-icon.js';
import { useCanAny, useSession } from '../session.js';

import { TopBar } from './standard.js';

function AdminItem({
  item,
  onNavigate,
}: {
  item: (typeof modules)[number];
  onNavigate?: () => void;
}) {
  const allowed = useCanAny(item.anyOf);
  if (!allowed) return null;
  return (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      className="flex min-h-target items-center gap-3 rounded-control px-3 py-2 text-small font-semibold hover:bg-paper/10 aria-[current=page]:bg-paper aria-[current=page]:text-ink"
    >
      <ModuleIcon name={item.icon} />
      {item.label}
    </NavLink>
  );
}
function AdminNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const { profile } = useSession();
  const sites = modules.find((item) => item.id === 'sites')!;
  const masterData = modules.find((item) => item.path === sites.parent)!;
  const canViewSites = useCanAny(sites.anyOf);
  return (
    <nav aria-label={ar.navigation.admin} className="grid gap-1">
      {modules
        .filter((item) => item.kind === 'admin')
        .map((item) => (
          <AdminItem key={item.id} item={item} onNavigate={onNavigate} />
        ))}
      {canViewSites && (
        <div className="mt-3 border-t border-paper/20 pt-3">
          <h3 className="px-3 text-small font-semibold">{masterData.label}</h3>
          <AdminItem item={sites} onNavigate={onNavigate} />
        </div>
      )}
      {profile?.isSuperadmin && (
        <div className="mt-3 border-t border-paper/20 pt-3">
          <h3 className="px-3 text-small font-semibold">{ar.auth.support}</h3>
          {modules
            .filter((item) => item.kind === 'support')
            .map((item) => (
              <AdminItem key={item.id} item={item} onNavigate={onNavigate} />
            ))}
        </div>
      )}
    </nav>
  );
}
export function AdminShell() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh pt-topbar">
      <TopBar
        navigation={
          <Button
            variant="ghost"
            iconOnly
            className="md:hidden"
            aria-label={ar.navigation.admin}
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            <Menu size={24} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        }
      />
      <div className="grid min-h-[calc(100dvh-var(--spacing-topbar))] md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden bg-ink px-3 py-4 text-paper md:block">
          <div className="sticky top-topbar">
            <Link to="/" className="flex min-h-target items-center px-3">
              <Logo />
            </Link>
            <h2 className="my-3 px-3 text-small font-semibold">
              {ar.navigation.admin}
            </h2>
            <AdminNavigation />
          </div>
        </aside>
        <main className="mx-auto w-full min-w-0 max-w-[1150px] p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
      <Modal
        drawer
        open={open}
        title={ar.navigation.admin}
        onClose={() => setOpen(false)}
      >
        <AdminNavigation onNavigate={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
