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
import { ThemeToggle } from '../../components/ui/theme-toggle.js';
import type { SessionProfile } from '../../lib/api/auth.js';
import { inboxKey, liveApi, type InboxQueue } from '../../lib/api/live.js';
import { settingsApi } from '../../lib/api/settings.js';
import { SiteDialog } from '../admin/site-dialog.js';
import { NewRequestDialog } from '../requests/new-request.js';
import { RequestFacts } from '../requests/summary.js';
import { requestHref } from '../requests/workspace.js';

/** The account label shown in the greeting: username, else display name, else none. */
function accountLabel(profile: SessionProfile | null | undefined) {
  return profile?.user?.username?.trim() || profile?.user?.name?.trim() || '';
}
// English by design; isolated left-to-right so Latin and Arabic labels both read correctly.
function Greeting({ profile }: { profile: SessionProfile | null | undefined }) {
  const label = accountLabel(profile);
  if (!label)
    return (
      <bdi dir="ltr" lang="en">
        {copy.welcomeFallback}
      </bdi>
    );
  const [before = '', after = ''] = copy.welcome.split('{label}');
  // Spaces stay outside the language spans so every accessible-name algorithm keeps them.
  const lead = before.trimEnd();
  const tail = after.trimStart();
  return (
    <bdi dir="ltr" className="min-w-0 text-end wrap-anywhere">
      {lead && <span lang="en">{lead}</span>}
      {lead !== before && ' '}
      <bdi>{label}</bdi>
      {tail !== after && ' '}
      {tail && <span lang="en">{tail}</span>}
    </bdi>
  );
}

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
    // The region keeps its «محتاج مني» name; the visible heading greets the signed-in account.
    <section aria-label={copy.inbox} className="grid min-w-0 gap-3">
      {/* Left to right: «طلب جديد» (with any other action beside it) → theme toggle → greeting. */}
      {/* Phones: a second action drops under «طلب جديد» so the greeting keeps the width. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <h2 className="row-span-2 flex min-h-target min-w-0 items-center text-title sm:row-span-1 sm:text-title-wide">
          <Greeting profile={profile} />
        </h2>
        <ThemeToggle />
        {canCreate && (
          <Button className="whitespace-nowrap" onClick={() => setCreate(true)}>
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
            {requestUi.newRequest}
          </Button>
        )}
        {canCreateSite && (
          <Button
            variant="secondary"
            className="col-span-2 justify-self-end whitespace-nowrap sm:col-span-1"
            onClick={() => setSiteOpen(true)}
          >
            <MapPinPlus size={20} strokeWidth={1.75} aria-hidden="true" />
            {admin.siteManager.add}
          </Button>
        )}
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
