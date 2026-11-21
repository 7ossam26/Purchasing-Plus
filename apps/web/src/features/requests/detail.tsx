import { formatDateTime } from '@purchasing-plus/shared';
import {
  ar,
  fulfilmentUi as fulfilment,
  purchasingUi as buying,
  requestUi as copy,
} from '@purchasing-plus/shared/i18n/ar';
import {
  quantity,
  sameDecimal,
  statusMap,
  urgencies,
  type ActionName,
  type DisplayedStage,
  type Urgency,
} from '@purchasing-plus/shared/lifecycle';
import { purchasingKeys } from '@purchasing-plus/shared/permissions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';

import { useCan, useCanAny, useCanOnSite } from '../../app/session.js';
import {
  ActionBar,
  type BarAction,
} from '../../components/shared/action-bar.js';
import {
  InlineError,
  LoadRecord,
} from '../../components/shared/record-feedback.js';
import { Button, buttonClass } from '../../components/ui/button.js';
import { ChipSelect } from '../../components/ui/choice.js';
import { useConfirm, usePrompt } from '../../components/ui/dialogs.js';
import { Modal } from '../../components/ui/modal.js';
import { Tabs } from '../../components/ui/tabs.js';
import { toast } from '../../components/ui/toast.js';
import { ApiError } from '../../lib/api/client.js';
import { purchasingApi } from '../../lib/api/purchasing.js';
import {
  requestApi,
  requestKey,
  timelineKey,
  type RequestCommand,
  type RequestDto,
} from '../../lib/api/requests.js';
import { settingsApi } from '../../lib/api/settings.js';
import { ItemEditor } from '../catalog/ItemEditor.js';

import { QuantityField, RequestFields, UrgencyChoices } from './forms.js';
import { PricingApproval } from './pricing-approval.js';
import { PurchasingTab } from './purchasing-tab.js';
import { usePurchaseWrites } from './purchasing-writes.js';
import { ReceiptTab } from './receipt.js';
import { ResolveItem } from './remaining-items.js';
import { ItemRows, RequestHeader, StageRail, Timeline } from './summary.js';
import {
  draftForm,
  hasAction,
  pausedEdit,
  pickerHref,
  requestEdit,
  requestHref,
  reviewHref,
  useOptions,
  useRequest,
  useRequestUpdates,
  validLine,
} from './workspace.js';

const area = 'mx-auto grid max-w-4xl gap-4';
export function RequestReviewPage() {
  const { request, draft } = useRequest();
  const client = useQueryClient();
  const navigate = useNavigate();
  const updates = useRequestUpdates(request.id);
  const canBrowse = useCan('catalog.view');
  const options = useOptions();
  const submit = useMutation({
    mutationFn: async () => {
      if (!(await draft.saveNow())) return;
      const latest =
        client.getQueryData<RequestDto>(requestKey(request.id)) ?? request;
      return requestApi.command(request.id, 'submit', {
        version: latest.version,
      });
    },
    onSuccess: (saved) => {
      if (!saved) return;
      updates.update(saved);
      toast.success(copy.submitted);
      void navigate(requestHref(request.id), { replace: true });
    },
    onError: updates.fail,
  });
  if (!hasAction(request, 'saveDraft'))
    return <Navigate to={requestHref(request.id)} replace />;
  const reason = !draft.form.items.length
    ? copy.itemsRequired
    : !draft.form.items.every(validLine)
      ? copy.invalidQuantity
      : undefined;
  return (
    <div className={area}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-title sm:text-title-wide">{copy.reviewTitle}</h1>
        <Link to={requestHref(request.id)} className={buttonClass('secondary')}>
          {copy.tabs}
        </Link>
      </header>
      <InlineError error={options.error} retry={() => void options.refetch()} />
      <fieldset disabled={submit.isPending} className="grid min-w-0 gap-3">
        <RequestFields
          form={draft.form}
          units={options.data?.units ?? []}
          locked={request.urgencyLocked}
          onChange={draft.set}
        />
        {canBrowse && (
          <Link
            className={buttonClass('secondary') + ' justify-self-start'}
            to={pickerHref(request.id, request.categoryId)}
          >
            <Plus size={18} aria-hidden="true" />
            {copy.browse}
          </Link>
        )}
      </fieldset>
      <InlineError error={draft.error} retry={() => void draft.saveNow()} />
      <div role="status" className="text-small text-concrete">
        {draft.saving ? copy.saving : draft.dirty ? copy.unsaved : copy.saved}
      </div>
      <ActionBar
        fullWidthPrimary
        stickyOnDesktop
        primary={{
          id: 'submit',
          label: copy.submit,
          reason,
          onClick: () => submit.mutate(),
          loading: submit.isPending,
        }}
      />
    </div>
  );
}

type Write = {
  perform: () => Promise<RequestDto | void>;
  success: (record: RequestDto | void) => void;
};
type Mode = 'quantities' | 'urgency' | 'copySite';
type ActionHandler = { label: string; go: () => void; overflow?: boolean };
const terminal = new Set<DisplayedStage>([
  'REJECTED',
  'CANCELLED',
  'COMPLETED',
]);

export function RequestDetailPage() {
  const { request, draft, revision, setRevision } = useRequest();
  const navigate = useNavigate();
  const client = useQueryClient();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const updates = useRequestUpdates(request.id);
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => params.get('tab') ?? 'items');
  const [jump, setJump] = useState(0);
  const [mode, setMode] = useState<Mode>();
  const [copySelection, setCopySelection] = useState<number[]>();
  const canTimeline = useCan('requests.viewTimeline');
  const canPurchase = useCanAny(purchasingKeys);
  const canReceipt = useCanOnSite('receipt.record', request.siteId);
  const canApprovePricing = useCanOnSite('pricing.approve', request.siteId);
  const canRejectPricing = useCanOnSite('pricing.reject', request.siteId);
  const showRounds = canApprovePricing || canRejectPricing;
  const feeInRound = request.rounds?.some(
    (round) =>
      round.status === 'PENDING' && round.deliveryFee === request.deliveryFee,
  );
  const purchaseWrite = usePurchaseWrites(request);
  const canBrowse = useCan('catalog.view');
  const createCatalog = useCanOnSite('catalog.create', request.siteId);
  const timeline = useQuery({
    queryKey: timelineKey(request.id),
    queryFn: ({ signal }) => requestApi.timeline(request.id, signal),
    enabled: canTimeline,
  });
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: ({ signal }) => settingsApi.get(signal),
  });
  const options = useOptions();
  const cancelRequest = useMutation({
    mutationFn: (reason: string) =>
      purchaseWrite((version) =>
        requestApi.command(request.id, 'cancel', { version, reason }),
      ),
    onSuccess: () => toast.success(fulfilment.cancelled),
  });
  const write = useMutation({
    mutationFn: async ({ perform }: Write) => {
      await client.cancelQueries({ queryKey: requestKey(request.id) });
      return perform();
    },
    onSuccess: (record, { success }) => success(record),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setRevision(null);
        setMode(undefined);
      }
      updates.fail(error);
    },
  });

  const events = timeline.data?.items ?? [];
  const currentEntry = events
    .filter(
      (event, index) =>
        event.stageAfter === request.displayedStage &&
        events[index - 1]?.stageAfter !== event.stageAfter,
    )
    .at(-1);
  const highlight = jump > 0 ? currentEntry?.id : undefined;
  useEffect(() => {
    if (tab !== 'timeline' || !jump || highlight === undefined) return;
    const row = document.getElementById('request-event-' + highlight);
    row?.scrollIntoView?.({ block: 'start' });
    row?.focus({ preventScroll: true });
  }, [highlight, jump, tab]);

  function saveCommand(
    command: RequestCommand,
    success: string,
    body: {
      reason?: string;
      urgency?: Urgency;
      siteId?: number;
      itemIds?: number[];
    } = {},
    copyDraft = false,
  ) {
    write.mutate({
      perform: async () => {
        if (!(await draft.saveNow())) return;
        const latest = draft.dirty
          ? client.getQueryData<RequestDto>(requestKey(request.id))
          : undefined;
        return requestApi.command(request.id, command, {
          version: latest?.version ?? request.version,
          ...body,
        });
      },
      success: (value) => {
        if (!value) return;
        updates.update(value);
        toast.success(success);
        setMode(undefined);
        if (copyDraft) {
          updates.refresh();
          void navigate(reviewHref(value.id));
        }
      },
    });
  }
  async function cancel() {
    const reason = await prompt({
      title: fulfilment.cancel,
      description: fulfilment.cancelConsequence,
      confirmLabel: fulfilment.cancelConfirm,
      mode: 'reason',
      tone: 'danger',
    });
    if (reason !== null) cancelRequest.mutate(reason);
  }
  function copyLines(itemIds?: number[]) {
    if (
      options.data?.sites.some(
        (site) => site.id === request.siteId && site.isActive,
      )
    )
      saveCommand('copy', copy.copied, { itemIds }, true);
    else {
      setCopySelection(itemIds);
      setMode('copySite');
    }
  }
  async function decide(verb: 'approve' | 'reject' | 'return') {
    if (verb === 'approve') {
      if (
        await confirm({
          title: copy.approveQuestion,
          confirmLabel: copy.approve,
        })
      )
        saveCommand(verb, copy.approved);
      return;
    }
    const reject = verb === 'reject';
    const reason = await prompt({
      title: reject ? copy.reject : copy.returnForEdit,
      label: reject ? ar.dialogs.reason : copy.returnNote,
      confirmLabel: reject ? copy.reject : copy.returnForEdit,
      mode: 'reason',
      tone: reject ? 'danger' : undefined,
    });
    if (reason !== null)
      saveCommand(verb, reject ? copy.rejected : copy.returnedToast, {
        reason,
      });
  }
  async function remove() {
    if (
      !(await confirm({
        title: copy.deleteQuestion,
        confirmLabel: copy.deleteDraft,
        tone: 'danger',
      }))
    )
      return;
    write.mutate({
      perform: async () => {
        if (!(await draft.saveNow())) return;
        const latest =
          client.getQueryData<RequestDto>(requestKey(request.id)) ?? request;
        await requestApi.remove(request.id, latest.version);
        return latest;
      },
      success: (value) => {
        if (!value) return;
        void client.invalidateQueries({ queryKey: ['requests', 'list'] });
        toast.success(copy.deleted);
        void navigate('/requests', { replace: true });
      },
    });
  }
  async function pause(verb: 'pause' | 'purchasing-return') {
    const reason = await prompt({
      title: verb === 'pause' ? buying.pauseQuestion : buying.returnQuestion,
      confirmLabel: verb === 'pause' ? buying.pause : buying.returnForEdit,
      mode: 'reason',
    });
    if (reason !== null)
      saveCommand(
        verb,
        verb === 'pause' ? buying.pausedToast : buying.returnedToast,
        { reason },
      );
  }
  function startRevision(mode: 'beforeApproval' | 'paused') {
    setTab('items');
    const form = draftForm(request);
    setRevision({ form, original: form, mode, version: request.version });
  }
  const handlers: Partial<Record<ActionName, ActionHandler>> = {
    submit: {
      label: copy.submit,
      go: () => saveCommand('submit', copy.submitted),
    },
    resubmit: {
      label: copy.resubmit,
      go: () => saveCommand('resubmit', copy.submitted),
    },
    saveDraft: {
      label: copy.continueDraft,
      go: () =>
        void navigate(
          canBrowse
            ? pickerHref(request.id, request.categoryId)
            : reviewHref(request.id),
        ),
    },
    deleteDraft: {
      label: copy.deleteDraft,
      go: () => void remove(),
      overflow: true,
    },
    editBeforeApproval: {
      label: copy.edit,
      go: () => startRevision('beforeApproval'),
    },
    editWhilePaused: {
      label: buying.editPaused,
      go: () => startRevision('paused'),
    },
    pause: { label: buying.pause, go: () => void pause('pause') },
    purchasingReturnForEdit: {
      label: buying.returnForEdit,
      go: () => void pause('purchasing-return'),
      overflow: true,
    },
    resume: {
      label: buying.resume,
      go: () => saveCommand('resume', buying.resumedToast),
    },
    editQuantities: {
      label: copy.editQuantities,
      go: () => setMode('quantities'),
    },
    approve: { label: copy.approve, go: () => void decide('approve') },
    reject: {
      label: copy.reject,
      go: () => void decide('reject'),
      overflow: true,
    },
    returnForEdit: {
      label: copy.returnForEdit,
      go: () => void decide('return'),
      overflow: true,
    },
    raiseUrgency: {
      label: copy.raiseUrgency,
      go: () => setMode('urgency'),
      overflow: true,
    },
    copyRequest: {
      label: copy.copy,
      go: () => copyLines(),
      overflow: true,
    },
    cancel: {
      label: fulfilment.cancel,
      go: () => void cancel(),
      overflow: true,
    },
  };
  const visible = request.availableActions.flatMap(({ action, hint }) => {
    const handler = handlers[action];
    if (!handler) return [];
    const bar: BarAction = {
      id: action,
      label: handler.label,
      onClick: handler.go,
      loading: write.isPending || cancelRequest.isPending,
      variant: hint === 'danger' ? 'danger-outline' : undefined,
    };
    return [{ bar, hint, overflow: handler.overflow }];
  });
  const primary = visible.find(
    (action) => action.hint === 'primary' && !action.overflow,
  );
  const inline = visible.filter(
    (action) => action !== primary && !action.overflow,
  );
  const overflow = visible.filter((action) => action.overflow);
  const shownTab = revision
    ? 'items'
    : tab === 'timeline' && canTimeline
      ? 'timeline'
      : tab === 'purchasing' && canPurchase
        ? 'purchasing'
        : tab === 'receipt' && canReceipt
          ? 'receipt'
          : 'items';
  const purchasingSelected = shownTab === 'purchasing';
  const tabHasToolbar =
    purchasingSelected ||
    shownTab === 'receipt' ||
    (shownTab === 'items' &&
      !revision &&
      (hasAction(request, 'approvePricing') ||
        hasAction(request, 'rejectPricing')));
  const toolbar = (
    <ActionBar
      stickyOnDesktop
      sticky={!tabHasToolbar}
      primary={primary?.bar}
      secondary={inline.map((action) => action.bar)}
      overflow={overflow.map((action) => action.bar)}
    />
  );
  const beforeTerminal = events
    .filter((event) => !terminal.has(event.stageAfter))
    .at(-1)?.stageAfter;
  const editableItems = revision ? (
    <>
      <RequestFields
        locked={request.urgencyLocked}
        hideUrgency={revision.mode === 'paused'}
        form={revision.form}
        units={options.data?.units ?? []}
        expanded
        onChange={(form) => setRevision({ ...revision, form })}
      />
      {canBrowse && (
        <Link
          className={buttonClass('secondary') + ' mt-2'}
          to={pickerHref(request.id, request.categoryId)}
        >
          {copy.browse}
        </Link>
      )}
    </>
  ) : (
    <div className="grid gap-3">
      {shownTab === 'items' && showRounds && (
        <PricingApproval request={request} write={purchaseWrite} />
      )}
      <ItemRows
        request={request}
        showDeliveryFee={!showRounds || !feeInRound}
        renderActions={(line) => (
          <ResolveItem request={request} line={line} write={purchaseWrite} />
        )}
        copyRejected={hasAction(request, 'copyRequest') ? copyLines : undefined}
        copyBusy={write.isPending}
        convert={
          createCatalog && hasAction(request, 'addToCatalog') && !draft.dirty
            ? (id) => void navigate(requestHref(request.id) + '/catalog/' + id)
            : undefined
        }
      />
    </div>
  );
  return (
    <article className={area}>
      <RequestHeader request={request} agingDays={settings.data?.agingDays} />
      <StageRail
        stage={request.displayedStage}
        at={request.stageStartedAt}
        terminalFrom={beforeTerminal}
        onJump={
          canTimeline
            ? () => {
                setTab('timeline');
                setJump((old) => old + 1);
              }
            : undefined
        }
      />
      {request.returnReason && (
        <aside className="grid gap-1 rounded-panel border border-distinct-fg bg-distinct-bg p-3 text-distinct-fg">
          <h2 className="text-subtitle">{copy.returned}</h2>
          <p className="whitespace-pre-wrap wrap-anywhere">
            {request.returnReason}
          </p>
        </aside>
      )}
      {request.pauseReason && (
        <aside className="grid gap-1 rounded-panel border border-distinct-fg bg-distinct-bg p-3 text-distinct-fg">
          <h2 className="text-subtitle">{buying.paused}</h2>
          <p className="whitespace-pre-wrap wrap-anywhere">
            {request.pauseReason}
          </p>
          <div className="flex flex-wrap gap-x-3 text-small">
            {request.pauser && (
              <span>
                {buying.pausedBy} <bdi>{request.pauser.name}</bdi>
              </span>
            )}
            {request.pausedAt && (
              <time dateTime={request.pausedAt} aria-label={buying.pausedAt}>
                {formatDateTime(request.pausedAt)}
              </time>
            )}
          </div>
        </aside>
      )}
      {!revision && (request.unitOrClient || request.note) && (
        <dl className="grid gap-2 rounded-panel border border-seam bg-paper p-3 text-small">
          {request.unitOrClient && (
            <div>
              <dt className="font-bold">{copy.client}</dt>
              <dd className="wrap-anywhere">{request.unitOrClient}</dd>
            </div>
          )}
          {request.note && (
            <div>
              <dt className="font-bold">{copy.note}</dt>
              <dd className="whitespace-pre-wrap wrap-anywhere">
                {request.note}
              </dd>
            </div>
          )}
        </dl>
      )}
      {tabHasToolbar && toolbar}
      <Tabs
        label={copy.tabs}
        value={shownTab}
        onChange={(value) => {
          if (!revision) setTab(value);
        }}
        tabs={[
          {
            id: 'items',
            label: copy.items,
            count: request.items.length,
            content: editableItems,
          },
          ...(canPurchase && !revision
            ? [
                {
                  id: 'purchasing',
                  label: buying.title,
                  content: (
                    <PurchasingTab
                      request={request}
                      active={purchasingSelected}
                      write={purchaseWrite}
                      template={settings.data?.rfqIntro}
                    />
                  ),
                },
              ]
            : []),
          ...(canReceipt && !revision
            ? [
                {
                  id: 'receipt',
                  label: fulfilment.receipt,
                  content: (
                    <ReceiptTab request={request} write={purchaseWrite} />
                  ),
                },
              ]
            : []),
          ...(canTimeline && !revision
            ? [
                {
                  id: 'timeline',
                  label: copy.timeline,
                  content: (
                    <LoadRecord query={timeline}>
                      {(data) => (
                        <Timeline events={data.items} highlight={highlight} />
                      )}
                    </LoadRecord>
                  ),
                },
              ]
            : []),
        ]}
      />
      {revision ? (
        <ActionBar
          stickyOnDesktop
          primary={{
            id: 'save',
            label: ar.common.save,
            loading: write.isPending,
            reason: revision.form.items.every(validLine)
              ? undefined
              : copy.invalidQuantity,
            onClick: () =>
              write.mutate({
                perform: () =>
                  revision.mode === 'paused'
                    ? purchasingApi.pauseEdit(
                        request.id,
                        pausedEdit(
                          revision.original,
                          revision.form,
                          revision.version,
                        ),
                      )
                    : requestApi.save(
                        request.id,
                        requestEdit(revision.form, revision.version),
                        false,
                      ),
                success: (value) => {
                  if (value) updates.update(value);
                  setRevision(null);
                  toast.success(copy.saved);
                },
              }),
          }}
          secondary={[
            {
              id: 'cancel',
              label: ar.common.cancel,
              onClick: () => setRevision(null),
            },
          ]}
        />
      ) : (
        !tabHasToolbar && toolbar
      )}
      {mode === 'urgency' && (
        <UrgencySheet
          current={request.urgency}
          busy={write.isPending}
          onClose={() => setMode(undefined)}
          onSave={(urgency) =>
            saveCommand('urgency', copy.urgencyRaised, { urgency })
          }
        />
      )}
      {mode === 'quantities' && (
        <QuantitySheet
          request={request}
          busy={write.isPending}
          onClose={() => setMode(undefined)}
          onSave={(version, lines) =>
            write.mutate({
              perform: () => requestApi.quantities(request.id, version, lines),
              success: (value) => {
                if (value) updates.update(value);
                setMode(undefined);
                toast.success(copy.saved);
              },
            })
          }
        />
      )}
      {mode === 'copySite' && (
        <Modal
          open
          title={copy.chooseCopySite}
          dismissible={!write.isPending}
          onClose={() => setMode(undefined)}
        >
          <LoadRecord query={options}>
            {({ sites }) => {
              const active = sites.filter((site) => site.isActive);
              return active.length ? (
                <ChipSelect
                  label={copy.site}
                  value={[]}
                  options={active.map((site) => ({
                    value: String(site.id),
                    label: site.name,
                  }))}
                  onChange={([siteId]) => {
                    if (siteId && !write.isPending)
                      saveCommand(
                        'copy',
                        copy.copied,
                        { siteId: Number(siteId), itemIds: copySelection },
                        true,
                      );
                  }}
                />
              ) : (
                <p>{copy.noSites}</p>
              );
            }}
          </LoadRecord>
        </Modal>
      )}
    </article>
  );
}

export function UrgencySheet({
  current,
  busy,
  onClose,
  onSave,
}: {
  current: Urgency;
  busy: boolean;
  onClose: () => void;
  onSave: (value: Urgency) => void;
}) {
  const [value, setValue] = useState<Urgency>();
  return (
    <Modal open title={copy.raiseUrgency} dismissible={!busy} onClose={onClose}>
      <div className="grid gap-3">
        <p className="text-small text-concrete">{statusMap[current].label}</p>
        <UrgencyChoices
          value={value}
          choices={urgencies.slice(urgencies.indexOf(current) + 1)}
          onChange={setValue}
        />
        <Button
          disabled={!value}
          loading={busy}
          onClick={() => {
            if (value) onSave(value);
          }}
        >
          {copy.raiseUrgency}
        </Button>
      </div>
    </Modal>
  );
}

function QuantitySheet({
  request,
  busy,
  onClose,
  onSave,
}: {
  request: RequestDto;
  busy: boolean;
  onClose: () => void;
  onSave: (
    version: number,
    lines: { itemId: number; quantity: string }[],
  ) => void;
}) {
  const [version] = useState(request.version);
  const [values, setValues] = useState<Record<number, string>>({});
  const lines = request.items.flatMap((item) => {
    const value = values[item.id];
    if (value === undefined) return [];
    const result = quantity.safeParse(value);
    if (result.success && sameDecimal(item.quantity, result.data)) return [];
    return [{ itemId: item.id, quantity: value }];
  });
  return (
    <Modal
      open
      title={copy.editQuantities}
      dismissible={!busy}
      onClose={onClose}
    >
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            lines.length &&
            lines.every((line) => quantity.safeParse(line.quantity).success)
          )
            onSave(version, lines);
        }}
      >
        {request.items.map((item) => (
          <QuantityField
            key={item.id}
            label={copy.quantityFor(item.snapshot.name)}
            value={values[item.id] ?? item.quantity}
            onChange={(value) => setValues({ ...values, [item.id]: value })}
          />
        ))}
        <Button
          type="submit"
          loading={busy}
          disabled={
            !lines.length ||
            lines.some((line) => !quantity.safeParse(line.quantity).success)
          }
        >
          {ar.common.save}
        </Button>
      </form>
    </Modal>
  );
}

export function RequestConversionPage() {
  const { request } = useRequest();
  const itemId = Number(useParams().lineId);
  const line = request.items.find((item) => item.id === itemId);
  const navigate = useNavigate();
  const can = useCanOnSite('catalog.create', request.siteId);
  const updates = useRequestUpdates(request.id);
  const [version] = useState(request.version);
  const close = useCallback(
    () => void navigate(requestHref(request.id), { replace: true }),
    [navigate, request.id],
  );
  if (!can || !line || !line.isOther || !hasAction(request, 'addToCatalog'))
    return <Navigate to={requestHref(request.id)} replace />;
  return (
    <>
      <RequestHeader request={request} />
      <ItemEditor
        nodeId={line.nodeId}
        onClose={close}
        conversion={{
          name: line.otherName ?? line.snapshot.name,
          unitId: line.unitId,
          categoryId: request.categoryId,
          save: async ({
            name,
            description,
            nodeId,
            unitId,
            attributeValues,
          }) => {
            try {
              const result = await requestApi.convert(request.id, line.id, {
                name,
                description,
                nodeId,
                unitId,
                attributeValues,
                version,
              });
              updates.update(result);
              toast.success(copy.catalogAdded);
            } catch (error) {
              updates.fail(error);
              throw error;
            }
          },
        }}
      />
    </>
  );
}
