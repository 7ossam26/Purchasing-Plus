import {
  admin,
  ar,
  liveUi as copy,
  requestUi,
} from '@purchasing-plus/shared/i18n/ar';
import { statusMap } from '@purchasing-plus/shared/lifecycle';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  Inbox as InboxIcon,
  MapPinPlus,
  Plus,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { useCan, useSession } from '../../app/session.js';
import { InlineError } from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { EmptyState, Skeleton } from '../../components/ui/states.js';
import { Tabs } from '../../components/ui/tabs.js';
import { inboxKey, liveApi, type InboxQueue } from '../../lib/api/live.js';
import { settingsApi } from '../../lib/api/settings.js';
import { SiteDialog } from '../admin/site-dialog.js';
import { NewRequestDialog } from '../requests/new-request.js';
import { RequestFacts } from '../requests/summary.js';
import { requestHref } from '../requests/workspace.js';

function InboxEmpty() {
  return (
    <EmptyState
      title={copy.emptyInbox}
      icon={<InboxIcon size={24} strokeWidth={1.75} />}
    />
  );
}

function QueueRows({
  queue,
  agingDays,
}: {
  queue: InboxQueue;
  agingDays?: number;
}) {
  if (!queue.items.length) return <InboxEmpty />;
  return (
    <ul className="divide-y divide-seam rounded-panel border border-seam bg-paper">
      {queue.items.map((request) => (
        <li key={request.id}>
          <Link
            to={
              requestHref(request.id) +
              (queue.id === 'purchasing'
                ? '?tab=purchasing'
                : queue.id === 'receipt'
                  ? '?tab=receipt'
                  : '')
            }
            className="flex min-h-target items-center gap-3 rounded-control p-3 transition-colors hover:bg-plaster sm:p-4"
          >
            <div className="grid min-w-0 flex-1 gap-1">
              <span className="text-subtitle font-bold">
                {request.number ? (
                  <bdi dir="ltr" className="numeric">
                    {request.number}
                  </bdi>
                ) : (
                  statusMap.DRAFT.label
                )}
              </span>
              <RequestFacts
                request={request}
                agingDays={agingDays}
                showTime
                showCounts
              />
            </div>
            <ChevronRight
              className="rtl-mirror shrink-0 text-concrete"
              size={20}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function HomeInbox() {
  const { profile } = useSession();
  const canCreate = useCan('requests.create');
  const canCreateSite = useCan('sites.create');
  const [siteOpen, setSiteOpen] = useState(false);
  const canView = useCan('requests.view');
  const [create, setCreate] = useState(false);
  const [selection, setSelection] = useState('');
  const inbox = useQuery({
    queryKey: [
      ...inboxKey,
      profile?.siteScope,
      profile?.sites.map((site) => site.id),
      profile?.permissions,
    ],
    queryFn: ({ signal }) => liveApi.inbox(signal),
    enabled: canView,
  });
  const queues = canView ? (inbox.data?.queues ?? []) : [];
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: ({ signal }) => settingsApi.get(signal),
    enabled: queues.some((queue) => queue.items.length > 0),
  });
  const current =
    queues.find((queue) => selection === queue.id) ??
    queues.find((queue) => queue.count > 0) ??
    queues[0];
  return (
    <section aria-labelledby="home-inbox" className="grid min-w-0 gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="home-inbox" className="text-title sm:text-title-wide">
          {copy.inbox}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (
            <Button onClick={() => setCreate(true)}>
              <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
              {requestUi.newRequest}
            </Button>
          )}
          {canCreateSite && (
            <Button variant="secondary" onClick={() => setSiteOpen(true)}>
              <MapPinPlus size={20} strokeWidth={1.75} aria-hidden="true" />
              {admin.siteManager.add}
            </Button>
          )}
        </div>
      </header>
      <InlineError error={inbox.error} retry={() => void inbox.refetch()} />
      {canView && inbox.isPending ? (
        <div role="status" aria-label={ar.common.loading}>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : current ? (
        <Tabs
          label={copy.inbox}
          value={current.id}
          onChange={setSelection}
          tabs={queues.map((queue) => ({
            id: queue.id,
            label: copy.queues[queue.id],
            count: queue.count,
            content: (
              <QueueRows queue={queue} agingDays={settings.data?.agingDays} />
            ),
          }))}
        />
      ) : (
        !inbox.error && (
          <div className="rounded-panel border border-seam bg-paper">
            <InboxEmpty />
          </div>
        )
      )}
      {siteOpen && canCreateSite && (
        <SiteDialog onClose={() => setSiteOpen(false)} />
      )}
      {create && <NewRequestDialog onClose={() => setCreate(false)} />}
    </section>
  );
}
