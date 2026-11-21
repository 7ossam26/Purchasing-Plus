import { formatNumber } from '@purchasing-plus/shared';
import { purchasingUi as copy } from '@purchasing-plus/shared/i18n/ar';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ShoppingCart } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import { Pagination } from '../components/shared/pagination.js';
import { LoadRecord } from '../components/shared/record-feedback.js';
import { EmptyState } from '../components/ui/states.js';
import { RequestFacts } from '../features/requests/summary.js';
import { requestHref } from '../features/requests/workspace.js';
import { requestApi } from '../lib/api/requests.js';
import { settingsApi } from '../lib/api/settings.js';

export function PurchasingPage() {
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get('page'));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: ({ signal }) => settingsApi.get(signal),
  });
  const query = useQuery({
    queryKey: ['requests', 'list', 'purchasing', page],
    queryFn: ({ signal }) =>
      requestApi.list({ queue: 'purchasing', page }, signal),
  });
  return (
    <section className="mx-auto grid max-w-5xl gap-4">
      <h1 className="text-title sm:text-title-wide">{copy.queue}</h1>
      <LoadRecord query={query}>
        {(result) =>
          result.items.length ? (
            <>
              <ul className="divide-y divide-seam rounded-panel border border-seam bg-paper">
                {result.items.map((request) => (
                  <li key={request.id}>
                    <Link
                      to={requestHref(request.id) + '?tab=purchasing'}
                      className="flex min-h-target items-center gap-3 rounded-control p-3 hover:bg-plaster sm:p-4"
                    >
                      <div className="grid min-w-0 flex-1 gap-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                          <bdi dir="ltr" className="numeric text-subtitle">
                            {request.number}
                          </bdi>
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
                onPageChange={(page) => setParams({ page: String(page) })}
              />
            </>
          ) : (
            <EmptyState
              title={copy.emptyQueue}
              icon={<ShoppingCart size={24} />}
            />
          )
        }
      </LoadRecord>
    </section>
  );
}
