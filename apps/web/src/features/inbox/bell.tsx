import { formatNumber, formatRelative } from '@purchasing-plus/shared';
import { ar, liveUi as copy } from '@purchasing-plus/shared/i18n/ar';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';

import { useSession } from '../../app/session.js';
import { Pagination } from '../../components/shared/pagination.js';
import { InlineError } from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { EmptyState, Skeleton } from '../../components/ui/states.js';
import { toastError } from '../../components/ui/toast.js';
import { ApiError } from '../../lib/api/client.js';
import { liveApi, notificationsKey } from '../../lib/api/live.js';

export function NotificationBell() {
  const location = useLocation();
  const { profile } = useSession();
  const scope = [profile?.siteScope, profile?.sites.map((site) => site.id)];
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const element = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const id = useId();
  const client = useQueryClient();
  const open = openedAt === location.key;
  const first = useQuery({
    queryKey: [...notificationsKey, ...scope, 1],
    queryFn: ({ signal }) => liveApi.notifications(1, signal),
    enabled: Boolean(profile),
  });
  const laterPage = Math.max(2, page);
  const later = useQuery({
    queryKey: [...notificationsKey, ...scope, laterPage],
    queryFn: ({ signal }) => liveApi.notifications(laterPage, signal),
    enabled: Boolean(profile) && open && page > 1,
  });
  const query = page === 1 ? first : later;
  const unread = first.data?.unread ?? 0;
  const read = useMutation({
    mutationFn: (id?: number) => liveApi.markRead(id),
    onSuccess: () => client.invalidateQueries({ queryKey: notificationsKey }),
    onError: (error) =>
      toastError(
        error instanceof ApiError
          ? error
          : { message: ar.common.fallbackError },
      ),
  });

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!element.current?.contains(event.target as Node)) setOpenedAt(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      setOpenedAt(null);
      toggle.current?.focus();
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div ref={element} className="relative">
      <Button
        ref={toggle}
        iconOnly
        variant="ghost"
        className="relative"
        aria-label={ar.navigation.notifications}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setPage(1);
          setOpenedAt(open ? null : location.key);
        }}
      >
        <Bell size={23} strokeWidth={1.75} aria-hidden="true" />
        {unread > 0 && (
          <bdi
            aria-hidden="true"
            className="numeric absolute end-0 top-0 rounded-full border border-paper bg-ppr px-1.5 text-micro text-paper"
          >
            {formatNumber(unread)}
          </bdi>
        )}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copy.unread(formatNumber(unread))}
      </span>
      {open && (
        <section
          id={id}
          aria-label={ar.navigation.notifications}
          className="fixed inset-x-2 top-topbar z-40 flex max-h-[min(76dvh,36rem)] flex-col overflow-hidden rounded-panel border border-seam bg-paper shadow-overlay sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:w-96"
        >
          <header className="flex flex-wrap items-center justify-between gap-x-2 border-b border-seam px-3 py-2">
            <h2 className="text-subtitle">{ar.navigation.notifications}</h2>
            {unread > 0 && (
              <Button
                variant="ghost"
                loading={read.isPending && read.variables === undefined}
                onClick={() => read.mutate(undefined)}
              >
                {copy.markAllRead}
              </Button>
            )}
          </header>
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <InlineError
              error={query.error}
              retry={() => void query.refetch()}
            />
            {query.isPending && (
              <div className="p-3" role="status" aria-label={ar.common.loading}>
                <Skeleton className="h-16" />
              </div>
            )}
            {query.data &&
              (query.data.items.length ? (
                <ul className="divide-y divide-seam">
                  {query.data.items.map((item) => (
                    <li key={item.id}>
                      <Link
                        to={'/requests/' + item.requestId}
                        className={
                          'flex min-h-target items-start gap-3 px-3 py-2 hover:bg-plaster ' +
                          (item.readAt ? '' : 'bg-ppr-wash')
                        }
                        onClick={() => {
                          if (!item.readAt) read.mutate(item.id);
                          setOpenedAt(null);
                        }}
                      >
                        <span
                          className={
                            'mt-2 size-2 shrink-0 rounded-full ' +
                            (item.readAt ? '' : 'bg-ppr')
                          }
                          aria-hidden="true"
                        />
                        <span className="grid min-w-0 gap-1">
                          <span className={item.readAt ? '' : 'font-bold'}>
                            {ar.lifecycle.events[item.type]}
                          </span>
                          <span className="flex flex-wrap gap-x-3 text-micro text-concrete">
                            {item.number && <bdi dir="ltr">{item.number}</bdi>}
                            <time dateTime={item.createdAt}>
                              {formatRelative(item.createdAt)}
                            </time>
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title={copy.emptyNotifications} />
              ))}
          </div>
          {query.data &&
            (page > 1 || query.data.total > query.data.pageSize) && (
              <div className="border-t border-seam p-2">
                <Pagination {...query.data} onPageChange={setPage} />
              </div>
            )}
        </section>
      )}
    </div>
  );
}
