import { formatNumber } from '@purchasing-plus/shared';
import {
  ar,
  purchasingUi as copy,
  requestUi,
} from '@purchasing-plus/shared/i18n/ar';
import {
  activeStages,
  purchasingQueueRules,
  statusMap,
  type DisplayedStage,
  type RequestStatus,
} from '@purchasing-plus/shared/lifecycle';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ShoppingCart } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import { Pagination } from '../components/shared/pagination.js';
import { LoadRecord } from '../components/shared/record-feedback.js';
import { Button } from '../components/ui/button.js';
import { Field, Select } from '../components/ui/field.js';
import { EmptyState } from '../components/ui/states.js';
import { Tabs } from '../components/ui/tabs.js';
import { RequestFacts } from '../features/requests/summary.js';
import { requestHref } from '../features/requests/workspace.js';
import { requestApi } from '../lib/api/requests.js';
import { settingsApi } from '../lib/api/settings.js';

// Requests in a purchasing queue status open on the purchasing tab; earlier and final ones on their items.
const purchasingStatuses = new Set<RequestStatus>(
  purchasingQueueRules.map((rule) => rule.status),
);
const isStage = (value: string | null): value is DisplayedStage =>
  activeStages.some((stage) => stage === value);

export function PurchasingPage() {
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get('page'));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const view = params.get('view') === 'action' ? 'action' : 'all';
  const rawStage = params.get('stage');
  const stage = isStage(rawStage) ? rawStage : '';
  const filters = {
    workspace: 'purchasing',
    queue: view === 'action' ? 'purchasing' : undefined,
    stage: stage || undefined,
    page,
  };
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: ({ signal }) => settingsApi.get(signal),
  });
  const query = useQuery({
    queryKey: ['requests', 'list', 'purchasing', filters],
    queryFn: ({ signal }) => requestApi.list(filters, signal),
  });
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (key !== 'page') next.delete('page');
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: key !== 'page', preventScrollReset: true });
  }
  const results = (
    <div className="grid gap-3">
      <div className="grid gap-2 rounded-panel border border-seam bg-paper p-3 sm:grid-cols-2 sm:p-4">
        <Field label={requestUi.stage}>
          {(props) => (
            <Select
              {...props}
              value={stage}
              onChange={(event) => update('stage', event.currentTarget.value)}
            >
              <option value="">{requestUi.allStages}</option>
              {activeStages.map((id) => (
                <option key={id} value={id}>
                  {statusMap[id].label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <LoadRecord query={query}>
        {(result) =>
          result.items.length ? (
            <>
              <ul className="divide-y divide-seam rounded-panel border border-seam bg-paper">
                {result.items.map((request) => (
                  <li key={request.id}>
                    <Link
                      to={
                        requestHref(request.id) +
                        (purchasingStatuses.has(request.status)
                          ? '?tab=purchasing'
                          : '')
                      }
                      className="flex min-h-target items-center gap-3 rounded-control p-3 hover:bg-plaster sm:p-4"
                    >
                      <div className="grid min-w-0 flex-1 gap-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                          <span className="numeric text-subtitle">
                            {request.number ? (
                              <bdi dir="ltr">{request.number}</bdi>
                            ) : (
                              statusMap.DRAFT.label
                            )}
                          </span>
                          <span className="text-small text-concrete">
                            {copy.count(formatNumber(request.items.length))}
                          </span>
                        </div>
                        <RequestFacts
                          request={request}
                          showTime
                          agingDays={settings.data?.agingDays}
                        />
                      </div>
                      <ChevronRight
                        size={20}
                        className="rtl-mirror shrink-0 text-concrete"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
              <Pagination
                {...result}
                onPageChange={(next) => update('page', String(next))}
              />
            </>
          ) : (
            <div className="rounded-panel border border-seam bg-paper">
              <EmptyState
                title={
                  stage
                    ? requestUi.noMatches
                    : view === 'action'
                      ? copy.emptyQueue
                      : copy.emptyWorkspace
                }
                icon={<ShoppingCart size={24} />}
                action={
                  stage ? (
                    <Button
                      variant="secondary"
                      onClick={() => update('stage', '')}
                    >
                      {ar.common.resetFilters}
                    </Button>
                  ) : undefined
                }
              />
            </div>
          )
        }
      </LoadRecord>
    </div>
  );
  return (
    <section className="mx-auto grid max-w-5xl gap-4">
      <h1 className="text-title sm:text-title-wide">{copy.queue}</h1>
      <Tabs
        label={copy.views}
        value={view}
        onChange={(id) => update('view', id === 'action' ? 'action' : '')}
        tabs={[
          {
            id: 'all',
            label: copy.allRequests,
            content: view === 'all' && results,
          },
          {
            id: 'action',
            label: copy.needsAction,
            content: view === 'action' && results,
          },
        ]}
      />
    </section>
  );
}
