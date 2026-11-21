import { formatDateTime, formatNumber } from '@purchasing-plus/shared';
import { ar, supportUi } from '@purchasing-plus/shared/i18n/ar';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  DataTable,
  type TableColumn,
} from '../../components/shared/data-table.js';
import { Pagination } from '../../components/shared/pagination.js';
import {
  errorDetails,
  InlineError,
} from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { Field, Input } from '../../components/ui/field.js';
import { AuditDetail } from '../../features/admin/audit-detail.js';
import {
  type AuditFilters,
  type AuditRow,
  supportApi,
} from '../../lib/api/support.js';

const copy = supportUi.audit;
const blank: AuditFilters = {
  from: '',
  to: '',
  userId: '',
  entity: '',
  action: '',
};
const columns: TableColumn<AuditRow>[] = [
  {
    id: 'user',
    header: copy.user,
    cell: (row) => (
      <>
        <bdi>{row.actorLabel ?? copy.missing}</bdi>
        {row.actorId !== null && (
          <div className="numeric text-small text-concrete">
            {formatNumber(row.actorId)}
          </div>
        )}
      </>
    ),
  },
  { id: 'action', header: copy.action, cell: (row) => <bdi>{row.action}</bdi> },
  { id: 'entity', header: copy.entity, cell: (row) => <bdi>{row.entity}</bdi> },
  {
    id: 'entityId',
    header: copy.entityId,
    cell: (row) => <bdi>{row.entityId ?? copy.missing}</bdi>,
  },
  {
    id: 'ip',
    header: copy.ip,
    cell: (row) => <bdi>{row.ip ?? copy.missing}</bdi>,
  },
];
const fields = [
  ['from', 'date'],
  ['to', 'date'],
  ['userId', 'text'],
  ['entity', 'text'],
  ['action', 'text'],
] as const;

export function AuditPage() {
  const [draft, setDraft] = useState(blank);
  const [filters, setFilters] = useState(blank);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const results = useQuery({
    queryKey: ['support', 'audit', page, filters],
    queryFn: ({ signal }) => supportApi.audit(page, filters, signal),
  });
  const verification = useMutation({ mutationFn: supportApi.verifyPage });
  const rows = results.data?.items ?? [];
  const ids = rows.map((row) => row.id);
  const currentVerification =
    verification.variables?.join(',') === ids.join(',')
      ? verification
      : undefined;
  const verified = new Map(
    currentVerification?.data?.items.map((row) => [row.id, row.verified]),
  );
  const mismatches = currentVerification?.data?.items.filter(
    (row) => !row.verified,
  ).length;
  const invalidRange = Boolean(draft.from && draft.to && draft.from > draft.to);

  function apply(next: AuditFilters) {
    setPage(1);
    setFilters(next);
    verification.reset();
  }

  return (
    <div className="grid min-w-0 gap-4">
      <h1 className="text-title sm:text-title-wide">{copy.title}</h1>
      <form
        className="grid gap-3 rounded-panel border border-seam bg-paper p-3 sm:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!invalidRange)
            apply({
              ...draft,
              entity: draft.entity.trim(),
              action: draft.action.trim(),
            });
        }}
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-5 [&>*]:min-w-0">
          {fields.map(([key, type]) => (
            <div
              key={key}
              className={key === 'userId' ? 'max-lg:col-span-2' : undefined}
            >
              <Field
                label={copy[key]}
                error={
                  key === 'to' && invalidRange ? copy.dateOrder : undefined
                }
              >
                {(props) => (
                  <Input
                    {...props}
                    type={type}
                    value={draft[key]}
                    dir={type === 'date' || key === 'userId' ? 'ltr' : 'auto'}
                    inputMode={key === 'userId' ? 'numeric' : undefined}
                    pattern={key === 'userId' ? '[1-9][0-9]{0,9}' : undefined}
                    maxLength={key === 'userId' ? 10 : 200}
                    onChange={(event) =>
                      setDraft({ ...draft, [key]: event.currentTarget.value })
                    }
                  />
                )}
              </Field>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={invalidRange}>
            {copy.apply}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setDraft(blank);
              apply(blank);
            }}
          >
            {ar.common.resetFilters}
          </Button>
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          loading={verification.isPending}
          disabled={!rows.length}
          onClick={() => verification.mutate(ids)}
        >
          {copy.verify}
        </Button>
        {mismatches !== undefined && (
          <p
            role="status"
            className={mismatches ? 'text-danger-fg' : 'text-ppr-deep'}
          >
            {mismatches
              ? copy.pageMismatch(formatNumber(mismatches))
              : copy.verified}
          </p>
        )}
      </div>
      <InlineError
        error={currentVerification?.error ?? null}
        retry={() => verification.mutate(ids)}
      />
      <DataTable
        caption={copy.title}
        rows={rows}
        columns={[
          {
            id: 'time',
            header: copy.time,
            cell: (row) => (
              <div className="grid justify-items-start gap-1">
                <time
                  dateTime={row.createdAt}
                  className="numeric whitespace-nowrap"
                >
                  {formatDateTime(row.createdAt)}
                </time>
                <Button
                  variant="ghost"
                  className="px-2"
                  onClick={() => setDetail(row)}
                >
                  {copy.details}
                </Button>
                {!(verified.get(row.id) ?? row.verified) && (
                  <span className="text-small font-semibold text-danger-fg">
                    {copy.mismatch}
                  </span>
                )}
              </div>
            ),
          },
          ...columns,
        ]}
        rowKey={(row) => row.id}
        loading={results.isPending}
        error={results.error ? errorDetails(results.error) : undefined}
        onRetry={() => void results.refetch()}
        emptyMessage={copy.empty}
        filteredMessage={copy.filteredEmpty}
        filtered={Object.values(filters).some(Boolean)}
      />
      {results.data && (
        <Pagination
          page={page}
          pageSize={results.data.pageSize}
          total={results.data.total}
          onPageChange={(next) => {
            verification.reset();
            setPage(next);
          }}
        />
      )}
      {detail && <AuditDetail row={detail} close={() => setDetail(null)} />}
    </div>
  );
}
