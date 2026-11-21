import { ar, requestUi as copy } from '@purchasing-plus/shared/i18n/ar';
import { quantity } from '@purchasing-plus/shared/lifecycle';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Outlet, useParams, useBlocker, useBeforeUnload } from 'react-router';

import { LoadRecord } from '../../components/shared/record-feedback.js';
import { useConfirm } from '../../components/ui/dialogs.js';
import { toast } from '../../components/ui/toast.js';
import { ApiError } from '../../lib/api/client.js';
import { purchasingKey, type PauseEdit } from '../../lib/api/purchasing.js';
import {
  requestApi,
  requestKey,
  timelineKey,
  type RequestDto,
  type RequestEdit,
  type RequestLine,
} from '../../lib/api/requests.js';

export const requestHref = (id: number) => '/requests/' + id;
export const reviewHref = (id: number) => requestHref(id) + '/review';
export const pickerHref = (id: number, nodeId: number) =>
  requestHref(id) + '/add/node/' + nodeId;
export const hasAction = (
  request: RequestDto,
  action: RequestDto['availableActions'][number]['action'],
) => request.availableActions.some((item) => item.action === action);
export const useOptions = () =>
  useQuery({
    queryKey: ['requests', 'options'],
    queryFn: ({ signal }) => requestApi.options(signal),
  });
export type BasketLine = {
  key: string;
  id?: number;
  catalogItemId: number | null;
  nodeId: number;
  unitId: number;
  unitName: string;
  name: string;
  specs: string;
  quantity: string;
  otherName: string | null;
};
export type DraftForm = {
  items: BasketLine[];
  urgency: RequestDto['urgency'];
  unitOrClient: string;
  note: string;
};
export function draftForm(request: RequestDto): DraftForm {
  return {
    items: request.items.map((line) => ({
      ...line,
      key: String(line.id),
      name: line.snapshot.name,
      unitName: line.snapshot.unitName,
    })),
    urgency: request.urgency,
    unitOrClient: request.unitOrClient ?? '',
    note: request.note ?? '',
  };
}
export function requestEdit(form: DraftForm, version: number): RequestEdit {
  return {
    version,
    urgency: form.urgency,
    unitOrClient: form.unitOrClient.trim() || null,
    note: form.note.trim() || null,
    items: form.items.map(
      ({ id, catalogItemId, nodeId, unitId, specs, quantity, otherName }) =>
        catalogItemId === null
          ? { id, nodeId, unitId, specs, quantity, otherName: otherName! }
          : { id, catalogItemId, unitId, specs, quantity },
    ),
  };
}
export function pausedEdit(
  original: DraftForm,
  form: DraftForm,
  version: number,
): PauseEdit {
  const before = requestEdit(original, version);
  const after = requestEdit(form, version);
  const existing = new Map(before.items!.map((item) => [item.id!, item]));
  const retained = new Set(
    after.items!.flatMap((item) => (item.id === undefined ? [] : [item.id])),
  );
  const add: NonNullable<PauseEdit['add']> = [];
  const change: NonNullable<PauseEdit['change']> = [];
  for (const { id, ...line } of after.items!) {
    if (id === undefined) {
      add.push(line);
      continue;
    }
    const old = existing.get(id)!;
    const fields = Object.fromEntries(
      Object.entries(line).filter(
        ([key, value]) => old[key as keyof typeof old] !== value,
      ),
    );
    if (Object.keys(fields).length) change.push({ itemId: id, fields });
  }
  return {
    version,
    fields: {
      ...(before.note !== after.note ? { note: after.note } : {}),
      ...(before.unitOrClient !== after.unitOrClient
        ? { unitOrClient: after.unitOrClient }
        : {}),
    },
    add,
    change,
    remove: [...existing.keys()].filter((id) => !retained.has(id)),
  };
}
export const validLine = (line: BasketLine | RequestLine) =>
  quantity.safeParse(line.quantity).success && line.unitId > 0;

export function useRequestUpdates(id: number) {
  const client = useQueryClient();
  function update(request: RequestDto) {
    client.setQueryData(requestKey(request.id), request);
    void client.invalidateQueries({ queryKey: ['requests', 'list'] });
    void client.invalidateQueries({ queryKey: timelineKey(id) });
    return client.invalidateQueries({ queryKey: purchasingKey(id) });
  }
  function refresh() {
    void client.invalidateQueries({ queryKey: ['requests', 'list'] });
    void client.invalidateQueries({ queryKey: timelineKey(id) });
    return Promise.all([
      client.invalidateQueries({ queryKey: requestKey(id) }),
      client.invalidateQueries({ queryKey: purchasingKey(id) }),
    ]);
  }
  function fail(error: unknown) {
    toast.error(
      error instanceof ApiError ? error.message : ar.common.fallbackError,
      {
        description: error instanceof ApiError ? error.fix : undefined,
      },
    );
    if (error instanceof ApiError && error.status === 409) return refresh();
  }
  return { update, refresh, fail };
}

type Pending = { form: DraftForm; version: number };
function useDraft(request: RequestDto) {
  const { update, fail } = useRequestUpdates(request.id);
  const [pending, setPending] = useState<DraftForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const queued = useRef<Pending | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<Promise<boolean> | null>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const canSave = hasAction(request, 'saveDraft');

  async function flush(): Promise<boolean> {
    clearTimeout(timer.current);
    while (inFlight.current) {
      if (!(await inFlight.current)) return false;
    }
    const attempt = queued.current;
    if (!attempt) return true;
    if (!canSave || !attempt.form.items.every(validLine)) return false;
    setSaving(true);
    setError(null);
    const send = requestApi
      .save(request.id, requestEdit(attempt.form, attempt.version), true)
      .then((saved) => {
        update(saved);
        const latest = queued.current;
        if (latest === attempt) queued.current = null;
        else if (latest) {
          const ids = new Map(
            attempt.form.items.map((line, index) => [
              line.key,
              saved.items[index]?.id,
            ]),
          );
          queued.current = {
            version: saved.version,
            form: {
              ...latest.form,
              items: latest.form.items.map((line) => ({
                ...line,
                id: line.id ?? ids.get(line.key),
              })),
            },
          };
        }
        setPending(queued.current?.form ?? null);
        return true;
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code === 'NO_CHANGES') {
          if (queued.current === attempt) {
            queued.current = null;
            setPending(null);
          }
          return true;
        }
        if (error instanceof ApiError && error.status === 409) {
          queued.current = null;
          setPending(null);
          fail(error);
        } else
          setError(error instanceof Error ? error : new Error(copy.saveFailed));
        return false;
      })
      .finally(() => {
        inFlight.current = null;
        setSaving(false);
      });
    inFlight.current = send;
    return send;
  }

  function set(form: DraftForm) {
    if (!canSave) return;
    queued.current = {
      form,
      version: queued.current?.version ?? request.version,
    };
    setPending(form);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1500);
  }
  async function saveNow() {
    while (queued.current || inFlight.current)
      if (!(await flush())) return false;
    return true;
  }
  return {
    form: pending ?? draftForm(request),
    dirty: pending !== null,
    saving,
    error,
    set,
    saveNow,
  };
}

function DraftGuard({ id }: { id: number }) {
  const base = requestHref(id);
  const blocker = useBlocker(
    ({ nextLocation }) =>
      nextLocation.pathname !== base &&
      !nextLocation.pathname.startsWith(base + '/'),
  );
  const confirm = useConfirm();
  useBeforeUnload((event) => event.preventDefault());
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let active = true;
    void confirm({
      title: ar.dialogs.leave,
      description: ar.dialogs.leaveDetail,
      confirmLabel: ar.dialogs.leaveAction,
      tone: 'danger',
    }).then((ok) => {
      if (!active) return;
      if (ok) blocker.proceed();
      else blocker.reset();
    });
    return () => {
      active = false;
    };
  }, [blocker, confirm]);
  return null;
}

type Revision = {
  form: DraftForm;
  original: DraftForm;
  version: number;
  mode: 'beforeApproval' | 'paused';
};
function RequestContent({ request }: { request: RequestDto }) {
  const draft = useDraft(request);
  const [revision, setRevision] = useState<Revision | null>(null);
  const activeRevision = hasAction(
    request,
    revision?.mode === 'paused' ? 'editWhilePaused' : 'editBeforeApproval',
  )
    ? revision
    : null;
  return (
    <WorkspaceContext.Provider
      value={{ request, draft, revision: activeRevision, setRevision }}
    >
      {(draft.dirty || activeRevision) && <DraftGuard id={request.id} />}
      <Outlet />
    </WorkspaceContext.Provider>
  );
}
type Workspace = {
  request: RequestDto;
  draft: ReturnType<typeof useDraft>;
  revision: Revision | null;
  setRevision: (value: Revision | null) => void;
};
const WorkspaceContext = createContext<Workspace | null>(null);
export function useRequest() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error('RequestWorkspace is required');
  return workspace;
}

export function RequestWorkspace() {
  const id = Number(useParams().id);
  const query = useQuery({
    queryKey: requestKey(id),
    queryFn: ({ signal }) => requestApi.get(id, signal),
  });
  return (
    <LoadRecord query={query}>
      {(request) => <RequestContent key={request.id} request={request} />}
    </LoadRecord>
  );
}
