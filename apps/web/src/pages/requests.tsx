import { ar, requestUi as copy } from '@purchasing-plus/shared/i18n/ar';
import {
  activeStages,
  statusMap,
  urgencies,
} from '@purchasing-plus/shared/lifecycle';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { useCan } from '../app/session.js';
import { Pagination } from '../components/shared/pagination.js';
import {
  InlineError,
  LoadRecord,
} from '../components/shared/record-feedback.js';
import { Button } from '../components/ui/button.js';
import { Field, Input, Select } from '../components/ui/field.js';
import { EmptyState } from '../components/ui/states.js';
import { NewRequestDialog } from '../features/requests/new-request.js';
import { RequestFacts } from '../features/requests/summary.js';
import { requestHref, useOptions } from '../features/requests/workspace.js';
import { requestApi } from '../lib/api/requests.js';
import { settingsApi } from '../lib/api/settings.js';

export function RequestsPage() {
  const [params, setParams] = useSearchParams();
  const [newOpen, setNewOpen] = useState(false);
  const allowed = useCan('requests.create');
  const options = useOptions();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: ({ signal }) => settingsApi.get(signal),
  });
  const page = Math.max(1, Number(params.get('page')) || 1);
  const read = (key: string) => params.get(key) ?? '';
  const filters = {
    page,
    stage: read('stage'),
    siteId: read('siteId'),
    categoryId: read('categoryId'),
    urgency: read('urgency'),
    q: read('q'),
  };
  const filtered = Object.entries(filters).some(
    ([key, value]) => key !== 'page' && value,
  );
  const list = useQuery({
    queryKey: ['requests', 'list', filters],
    queryFn: ({ signal }) => requestApi.list(filters, signal),
  });
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (key !== 'page') next.delete('page');
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: key !== 'page', preventScrollReset: true });
  }
  const select = (
    key: string,
    label: string,
    all: string,
    choices: { id: string | number; name: string }[],
  ) => (
    <Field label={label}>
      {(props) => (
        <Select
          {...props}
          value={read(key)}
          onChange={(event) => filter(key, event.currentTarget.value)}
        >
          <option value="">{all}</option>
          {choices.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
  const newButton = allowed && (
    <Button onClick={() => setNewOpen(true)}>
      <Plus size={18} aria-hidden="true" />
      {copy.newRequest}
    </Button>
  );
  return (
    <section className="mx-auto grid max-w-5xl gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-title sm:text-title-wide">{copy.title}</h1>
        {newButton}
      </header>
      <div className="grid gap-3 rounded-panel border border-seam bg-paper p-3 sm:p-4">
        <Field label={copy.search}>
          {(props) => (
            <Input
              {...props}
              type="search"
              dir="ltr"
              value={read('q')}
              maxLength={40}
              onChange={(event) =>
                filter(
                  'q',
                  event.currentTarget.value.replace(/[^a-z\d-]/gi, ''),
                )
              }
            />
          )}
        </Field>
        <InlineError
          error={options.error}
          retry={() => void options.refetch()}
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {select(
            'stage',
            copy.stage,
            copy.allStages,
            activeStages.map((id) => ({ id, name: statusMap[id].label })),
          )}
          {select(
            'siteId',
            copy.site,
            copy.allSites,
            options.data?.sites ?? [],
          )}
          {select(
            'categoryId',
            copy.category,
            copy.allCategories,
            options.data?.categories ?? [],
          )}
          {select(
            'urgency',
            copy.urgency,
            copy.allUrgencies,
            urgencies.map((id) => ({ id, name: statusMap[id].label })),
          )}
        </div>
      </div>
      <LoadRecord query={list}>
        {(result) =>
          result.items.length ? (
            <div className="grid gap-3">
              <ul className="divide-y divide-seam rounded-panel border border-seam bg-paper">
                {result.items.map((request) => (
                  <li key={request.id}>
                    <Link
                      to={requestHref(request.id)}
                      className="flex min-h-target items-center gap-3 px-3 py-3 transition-colors hover:bg-plaster sm:px-4"
                    >
                      <div className="grid min-w-0 grow gap-1">
                        <span className="numeric text-subtitle font-bold">
                          {request.number ? (
                            <bdi dir="ltr">{request.number}</bdi>
                          ) : (
                            statusMap.DRAFT.label
                          )}
                        </span>
                        <RequestFacts
                          request={request}
                          agingDays={settings.data?.agingDays}
                          showTime
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
                onPageChange={(next) => filter('page', String(next))}
              />
            </div>
          ) : (
            <div className="rounded-panel border border-seam bg-paper">
              <EmptyState
                title={filtered ? copy.noMatches : copy.emptyRequests}
                icon={<ClipboardList size={24} />}
                action={
                  filtered ? (
                    <Button variant="secondary" onClick={() => setParams({})}>
                      {ar.common.resetFilters}
                    </Button>
                  ) : undefined
                }
              />
            </div>
          )
        }
      </LoadRecord>
      {newOpen && <NewRequestDialog onClose={() => setNewOpen(false)} />}
    </section>
  );
}
