import { ar, requestUi as copy } from '@purchasing-plus/shared/i18n/ar';
import {
  displayedStages,
  statusMap,
  urgencies,
} from '@purchasing-plus/shared/lifecycle';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight, ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { useCan } from '../app/session.js';
import { Pagination } from '../components/shared/pagination.js';
import {
  InlineError,
  LoadRecord,
} from '../components/shared/record-feedback.js';
import { Button } from '../components/ui/button.js';
import { ChipSelect } from '../components/ui/choice.js';
import { Field, Input, Select } from '../components/ui/field.js';
import { Modal } from '../components/ui/modal.js';
import { EmptyState } from '../components/ui/states.js';
import { CategoryIcon } from '../features/catalog/presentation.js';
import { RequestFacts } from '../features/requests/summary.js';
import {
  pickerHref,
  requestHref,
  reviewHref,
  useOptions,
  useRequestUpdates,
} from '../features/requests/workspace.js';
import { requestApi, type RequestOptions } from '../lib/api/requests.js';
import { settingsApi } from '../lib/api/settings.js';

function NewDraft({
  options,
  onClose,
}: {
  options: RequestOptions;
  onClose: () => void;
}) {
  const sites = options.sites.filter((site) => site.isActive);
  const categories = options.categories.filter((category) => category.isActive);
  const [selection, setSelection] = useState('');
  const siteId = sites.length === 1 ? sites[0]!.id : Number(selection);
  const navigate = useNavigate();
  const canBrowse = useCan('catalog.view');
  const updates = useRequestUpdates(0);
  const create = useMutation({
    mutationFn: (categoryId: number) =>
      requestApi.create({ siteId, categoryId }),
    onSuccess: (request) => {
      updates.update(request);
      onClose();
      void navigate(
        canBrowse
          ? pickerHref(request.id, request.categoryId)
          : reviewHref(request.id),
      );
    },
  });
  if (!sites.length) return <EmptyState title={copy.noSites} />;
  return (
    <div className="grid gap-4">
      {sites.length > 1 && (
        <div>
          <h3 className="text-subtitle">{copy.chooseSite}</h3>
          <ChipSelect
            label={copy.site}
            value={selection ? [selection] : []}
            options={sites.map((site) => ({
              value: String(site.id),
              label: site.name,
            }))}
            onChange={(values) => setSelection(values.at(-1) ?? '')}
          />
        </div>
      )}
      <div className="grid gap-2">
        <h3 className="text-subtitle">{copy.chooseCategory}</h3>
        {!categories.length ? (
          <EmptyState title={copy.noCategories} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {categories.map((category) => (
              <Button
                key={category.id}
                variant="secondary"
                disabled={!siteId || create.isPending}
                className="min-h-20 flex-col whitespace-normal text-center"
                onClick={() => create.mutate(category.id)}
              >
                <CategoryIcon name={category.iconKey} />
                <bdi>{category.name}</bdi>
              </Button>
            ))}
          </div>
        )}
        {!siteId && (
          <p className="text-small text-concrete">{copy.chooseSite}</p>
        )}
        {create.isPending && (
          <p role="status" className="text-small text-concrete">
            {copy.saving}
          </p>
        )}
        <InlineError error={create.error} />
      </div>
    </div>
  );
}
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
            displayedStages.map((id) => ({ id, name: statusMap[id].label })),
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
                      className="flex min-h-target items-center gap-3 px-3 py-3 hover:bg-neutral-bg sm:px-4"
                    >
                      <div className="grid min-w-0 grow gap-1">
                        <span className="numeric text-subtitle">
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
      {newOpen && (
        <Modal open title={copy.newRequest} onClose={() => setNewOpen(false)}>
          <LoadRecord query={options}>
            {(data) => (
              <NewDraft options={data} onClose={() => setNewOpen(false)} />
            )}
          </LoadRecord>
        </Modal>
      )}
    </section>
  );
}
