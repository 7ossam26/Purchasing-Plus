import { formatDateTime, formatNumber } from '@purchasing-plus/shared';
import { purchasingUi as copy } from '@purchasing-plus/shared/i18n/ar';
import { isClosed } from '@purchasing-plus/shared/lifecycle';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useCallback, useState } from 'react';

import { useCanOnSite } from '../../app/session.js';
import {
  InlineError,
  LoadRecord,
} from '../../components/shared/record-feedback.js';
import { useLeaveGuard } from '../../components/shared/use-leave-guard.js';
import { Button } from '../../components/ui/button.js';
import { EmptyState } from '../../components/ui/states.js';
import { Tabs } from '../../components/ui/tabs.js';
import {
  purchasingApi,
  purchasingKey,
  type PurchasingLine,
  type PurchasingView,
  type RfqBatch,
} from '../../lib/api/purchasing.js';
import type { RequestDto } from '../../lib/api/requests.js';

import type { SaveStatus } from './purchasing-autosave.js';
import {
  PricingMode,
  PurchaseLineFlags,
  PurchaseLineTitle,
} from './purchasing-pricing.js';
import {
  BatchComposer,
  SelectRow,
  SendBatchSheet,
  SentHistory,
} from './purchasing-rfq.js';
import { usePurchaseWrites, type PurchaseWrite } from './purchasing-writes.js';
import { hasAction } from './workspace.js';

function PendingPurchaseGuard() {
  useLeaveGuard(true);
  return null;
}
export function PurchasingTab({
  request,
  active,
  template,
}: {
  request: RequestDto;
  active: boolean;
  template?: string;
}) {
  const query = useQuery({
    queryKey: purchasingKey(request.id),
    queryFn: ({ signal }) => purchasingApi.get(request.id, signal),
    enabled: active,
  });
  const canRfq = useCanOnSite('purchasing.sendRfq', request.siteId);
  const canPrice = useCanOnSite('purchasing.price', request.siteId);
  const write = usePurchaseWrites(request);
  const [mode, setMode] = useState(canPrice && !canRfq ? 'price' : 'rfq');
  const [states, setStates] = useState<Record<string, SaveStatus>>({});
  const report = useCallback((key: string, status: SaveStatus | null) => {
    setStates((states) => {
      const previous = states[key];
      if (previous === status || (!previous && status === null)) return states;
      const next = { ...states };
      if (status) next[key] = status;
      else delete next[key];
      return next;
    });
  }, []);
  const saveStatus = Object.values(states);
  const data = query.data;
  if (!data) {
    if (!active) return null;
    return <LoadRecord query={query}>{() => null}</LoadRecord>;
  }
  const pricing = data.pricing && (
    <PricingMode
      data={data}
      write={write}
      report={report}
      saveStatus={saveStatus}
    />
  );
  return (
    <div className="grid min-w-0 gap-2">
      {saveStatus.length > 0 && <PendingPurchaseGuard />}
      <InlineError error={query.error} retry={() => void query.refetch()} />
      {pricing ? (
        <Tabs
          label={copy.modes}
          value={mode}
          onChange={setMode}
          tabs={[
            {
              id: 'rfq',
              label: copy.rfq,
              content: (
                <RfqMode
                  data={data}
                  template={template}
                  write={write}
                  canRfq={canRfq}
                />
              ),
            },
            { id: 'price', label: copy.pricing, content: pricing },
          ]}
        />
      ) : (
        <RfqMode
          data={data}
          template={template}
          write={write}
          canRfq={canRfq}
        />
      )}
    </div>
  );
}
function RfqMode({
  data,
  template,
  write,
  canRfq,
}: {
  data: PurchasingView;
  template?: string;
  write: PurchaseWrite;
  canRfq: boolean;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [historyId, setHistoryId] = useState<number>();
  const [compose, setCompose] = useState(false);
  const [sending, setSending] = useState<RfqBatch>();
  const lines = data.items.filter((line) => !isClosed(line));
  const selection = lines.filter((line) => selected.includes(line.id));
  const canCreate = canRfq && hasAction(data, 'createBatch');
  const displayBatch =
    sending &&
    (data.batches.find((batch) => batch.id === sending.id) ?? sending);
  const history = data.items.find((line) => line.id === historyId);
  function toggle(line: PurchasingLine) {
    setSelected((ids) =>
      ids.includes(line.id)
        ? ids.filter((id) => id !== line.id)
        : [...ids, line.id],
    );
  }
  return (
    <div className="grid min-w-0 gap-3">
      {canCreate && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-seam bg-paper px-2">
          <Button
            variant="ghost"
            onClick={() =>
              setSelected(
                selection.length === lines.length
                  ? []
                  : lines.map((line) => line.id),
              )
            }
          >
            {selection.length === lines.length
              ? copy.clearSelection
              : copy.selectAll}
          </Button>
          <span aria-live="polite" className="text-small text-concrete">
            {copy.selection(formatNumber(selection.length))}
          </span>
        </div>
      )}
      {lines.length ? (
        <ul className="divide-y divide-seam rounded-panel border border-seam bg-paper">
          {lines.map((line) => (
            <li key={line.id} className="grid min-w-0 gap-1 p-2">
              {canCreate ? (
                <SelectRow
                  label={copy.pickItem(line.snapshot.name)}
                  checked={selected.includes(line.id)}
                  onChange={() => toggle(line)}
                >
                  <PurchaseLineTitle line={line} />
                </SelectRow>
              ) : (
                <div className="p-2">
                  <PurchaseLineTitle line={line} />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 px-2">
                <PurchaseLineFlags line={line} />
                {!!line.sentSupplierCount && (
                  <Button
                    variant="secondary"
                    onClick={() => setHistoryId(line.id)}
                  >
                    <History size={16} aria-hidden="true" />
                    {copy.sentCount(formatNumber(line.sentSupplierCount))}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={copy.noItems} />
      )}
      {!!data.batches.length && (
        <section className="grid gap-2 rounded-panel border border-seam bg-paper p-3">
          <h3 className="text-subtitle">{copy.batchHistory}</h3>
          <ul className="divide-y divide-seam">
            {data.batches.map((batch) => (
              <li
                className="flex flex-wrap items-center justify-between gap-x-2 py-1"
                key={batch.id}
              >
                <div className="grid gap-0.5">
                  <span className="font-semibold">
                    {copy.batchLabel(formatNumber(batch.itemIds.length))}
                  </span>
                  <time
                    dateTime={batch.createdAt}
                    className="text-small text-concrete"
                  >
                    {formatDateTime(batch.createdAt)}
                  </time>
                </div>
                {!!batch.suppliers?.length && (
                  <Button variant="ghost" onClick={() => setSending(batch)}>
                    {canRfq &&
                    batch.suppliers.some((row) => !row.sentAt) &&
                    hasAction(data, 'markBatchSent')
                      ? copy.resumeBatch
                      : copy.batchDetails}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {canCreate && (
        <div className="sticky bottom-0 z-20 grid gap-1 border-t border-seam bg-paper p-2 pb-[max(8px,env(safe-area-inset-bottom))] sm:rounded-control sm:border">
          <Button disabled={!selection.length} onClick={() => setCompose(true)}>
            {copy.chooseSuppliers}
          </Button>
          {!selection.length && (
            <p className="text-small text-concrete">{copy.selectItems}</p>
          )}
        </div>
      )}
      {history && (
        <SentHistory line={history} onClose={() => setHistoryId(undefined)} />
      )}
      {compose && canCreate && (
        <BatchComposer
          request={data}
          items={selection}
          template={template}
          write={write}
          onClose={() => setCompose(false)}
          onCreated={(batch) => {
            setCompose(false);
            setSelected([]);
            setSending(batch);
          }}
        />
      )}
      {displayBatch && (
        <SendBatchSheet
          id={data.id}
          batch={displayBatch}
          write={write}
          canMark={canRfq && hasAction(data, 'markBatchSent')}
          canEdit={canRfq && hasAction(data, 'editBatchMessage')}
          onUpdate={(batch) =>
            setSending((current) =>
              current?.id === batch.id ? batch : current,
            )
          }
          onClose={() => setSending(undefined)}
        />
      )}
    </div>
  );
}
