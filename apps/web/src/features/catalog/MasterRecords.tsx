import { normalizeArabic } from '@purchasing-plus/shared';
import { admin, ar, masterData as copy } from '@purchasing-plus/shared/i18n/ar';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode, type SubmitEvent } from 'react';

import { useCan } from '../../app/session.js';
import {
  DataTable,
  type TableColumn,
} from '../../components/shared/data-table.js';
import {
  errorDetails,
  InlineError,
} from '../../components/shared/record-feedback.js';
import { RecordManager } from '../../components/shared/record-manager.js';
import { Button } from '../../components/ui/button.js';
import { useConfirm } from '../../components/ui/dialogs.js';
import { Field, Input, Select } from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { toast } from '../../components/ui/toast.js';
import type { NamedRecord } from '../../lib/api/catalog.js';

import { Stopped } from './presentation.js';

export type FormProps<Row> = {
  row?: Row;
  onBusy: (busy: boolean) => void;
  onSaved: (another: boolean) => Promise<void>;
};
type Area = 'attributes' | 'units' | 'suppliers';
const permissions = {
  attributes: ['attributes.create', 'attributes.edit', 'attributes.delete'],
  units: ['units.create', 'units.edit', 'units.delete'],
  suppliers: ['suppliers.create', 'suppliers.edit', 'suppliers.delete'],
} as const satisfies Record<Area, readonly PermissionKey[]>;
export const recordName: TableColumn<NamedRecord> = {
  id: 'name',
  header: admin.name,
  cell: ({ name }) => <bdi className="wrap-anywhere">{name}</bdi>,
};

export function MasterRecords<Row extends NamedRecord>({
  area,
  title,
  add,
  edit,
  empty,
  columns,
  list,
  activate,
  deactivate,
  remove,
  form,
  extraActions,
}: {
  area: Area;
  title: string;
  add: string;
  edit: string;
  empty: string;
  columns: TableColumn<Row>[];
  list: (signal: AbortSignal) => Promise<Row[]>;
  activate: (row: Row) => Promise<unknown>;
  deactivate: (row: Row) => Promise<unknown>;
  remove: (row: Row) => Promise<unknown>;
  form: (props: FormProps<Row>) => ReactNode;
  extraActions?: (row: Row) => ReactNode;
}) {
  const [createKey, editKey, deleteKey] = permissions[area];
  const canAdd = useCan(createKey);
  const canEdit = useCan(editKey);
  const canDelete = useCan(deleteKey);
  const [editor, setEditor] = useState<Row | 'new' | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const client = useQueryClient();
  const confirm = useConfirm();
  const refresh = () => client.invalidateQueries({ queryKey: ['master-data'] });
  const query = useQuery({
    queryKey: ['master-data', area],
    queryFn: ({ signal }) => list(signal),
  });
  const shape: TableColumn<Row>[] = [
    ...columns,
    {
      id: 'status',
      header: admin.status,
      cell: (row) => (row.isActive ? admin.active : <Stopped active={false} />),
    },
  ];
  const change = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      toast.success(copy.saved);
      await refresh();
    },
  });
  async function guarded(row: Row, mode: 'deactivate' | 'delete') {
    const stopping = mode === 'deactivate';
    if (
      await confirm({
        title: stopping ? copy.deactivateTitle : copy.deleteTitle,
        description: stopping ? copy.deactivateDetail : copy.deleteDetail,
        confirmLabel: stopping ? copy.deactivate : ar.common.delete,
        tone: 'danger',
      })
    )
      change.mutate(() => (stopping ? deactivate(row) : remove(row)));
  }
  const text = normalizeArabic(search).toLowerCase();
  const rows =
    query.data?.filter(
      ({ name, isActive }) =>
        normalizeArabic(name).toLowerCase().includes(text) &&
        (!filter || isActive === (filter === 'active')),
    ) ?? [];

  return (
    <RecordManager
      title={title}
      parent="/master-data"
      add={
        canAdd
          ? {
              id: 'new',
              label: add,
              onClick: () => setEditor('new'),
            }
          : undefined
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={admin.search}>
          {(props) => (
            <Input
              {...props}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
          )}
        </Field>
        <Field label={admin.status}>
          {(props) => (
            <Select
              {...props}
              value={filter}
              onChange={(event) => setFilter(event.currentTarget.value)}
            >
              <option value="">{admin.all}</option>
              <option value="active">{admin.active}</option>
              <option value="inactive">{copy.stopped}</option>
            </Select>
          )}
        </Field>
      </div>
      <InlineError error={change.error} />
      <DataTable
        caption={title}
        rows={rows}
        rowKey={({ id }) => id}
        columns={shape}
        loading={query.isPending}
        error={query.error ? errorDetails(query.error) : undefined}
        onRetry={() => void query.refetch()}
        emptyMessage={empty}
        filtered={Boolean(text || filter)}
        filteredMessage={admin.noMatches}
        onReset={() => {
          setSearch('');
          setFilter('');
        }}
        actions={
          canEdit || canDelete
            ? (row) => (
                <div className="flex flex-wrap justify-end gap-1">
                  {canEdit && (
                    <Button variant="secondary" onClick={() => setEditor(row)}>
                      {admin.edit}
                    </Button>
                  )}
                  {canEdit && extraActions?.(row)}
                  {canEdit && !row.isActive && (
                    <Button
                      variant="secondary"
                      disabled={change.isPending}
                      onClick={() => change.mutate(() => activate(row))}
                    >
                      {copy.reactivate}
                    </Button>
                  )}
                  {canDelete && row.isActive && (
                    <Button
                      variant="secondary"
                      disabled={change.isPending}
                      onClick={() => void guarded(row, 'deactivate')}
                    >
                      {copy.deactivate}
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="danger-outline"
                      disabled={change.isPending}
                      onClick={() => void guarded(row, 'delete')}
                    >
                      {ar.common.delete}
                    </Button>
                  )}
                </div>
              )
            : undefined
        }
      />
      <Modal
        open={editor === 'new' ? canAdd : Boolean(editor) && canEdit}
        title={editor === 'new' ? add : edit}
        dismissible={!busy}
        onClose={() => setEditor(null)}
      >
        <div key={formKey}>
          {form({
            row: editor && editor !== 'new' ? editor : undefined,
            onBusy: setBusy,
            onSaved: async (another) => {
              await refresh();
              toast.success(copy.saved);
              if (another) setFormKey((key) => key + 1);
              else setEditor(null);
            },
          })}
        </div>
      </Modal>
    </RecordManager>
  );
}

export function RecordForm<Input>({
  row,
  onBusy,
  onSaved,
  read,
  save,
  children,
}: FormProps<NamedRecord> & {
  read: (
    data: FormData,
  ) => { data: Input } | { errors: Record<string, string> };
  save: (input: Input) => Promise<unknown>;
  children: (errors: Record<string, string>) => ReactNode;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [another, setAnother] = useState(false);
  const change = useMutation({
    mutationFn: ({ input }: { input: Input; another: boolean }) => save(input),
    onSuccess: (_record, { another }) => onSaved(another),
  });
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (change.isPending) return;
    const result = read(new FormData(event.currentTarget));
    setErrors('errors' in result ? result.errors : {});
    if ('errors' in result) return;
    const again =
      !row &&
      (event.nativeEvent.submitter as HTMLButtonElement | null)?.value ===
        'another';
    setAnother(again);
    onBusy(true);
    try {
      await change.mutateAsync({ input: result.data, another: again });
    } catch {
      // Show API validation and the recovery hint inline.
    } finally {
      onBusy(false);
    }
  }
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => void submit(event)}
    >
      {children(errors)}
      <InlineError error={change.error} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={change.isPending}
          loading={change.isPending && !another}
        >
          {row ? admin.saveChanges : ar.common.save}
        </Button>
        {!row && (
          <Button
            type="submit"
            value="another"
            variant="secondary"
            disabled={change.isPending}
            loading={change.isPending && another}
          >
            {admin.saveAnother}
          </Button>
        )}
      </div>
    </form>
  );
}

export function NameField({
  row,
  error,
}: {
  row?: NamedRecord;
  error?: string;
}) {
  return (
    <Field label={admin.name} required error={error}>
      {(props) => (
        <Input
          {...props}
          name="name"
          defaultValue={row?.name}
          maxLength={200}
          data-initial-focus
        />
      )}
    </Field>
  );
}
