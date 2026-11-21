import {
  dataColumnLabel,
  dataColumns,
  formatNumber,
  type DataEntity,
  type DataPreview,
} from '@purchasing-plus/shared';
import { ar, dataUi as copy } from '@purchasing-plus/shared/i18n/ar';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Button } from '../../components/ui/button.js';
import { ApiError, saveDownload } from '../../lib/api/client.js';
import { dataApi } from '../../lib/api/data.js';

function TransferError({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div
      role="alert"
      className="grid justify-items-start gap-2 text-small text-danger-fg"
    >
      <p>
        {error.message} {error instanceof ApiError && error.fix}
      </p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          {ar.common.retry}
        </Button>
      )}
    </div>
  );
}

function DownloadFile({
  entity,
  kind,
}: {
  entity: DataEntity;
  kind: 'template' | 'export';
}) {
  const download = useMutation({
    mutationFn: () => dataApi[kind](entity),
    onSuccess: (file) =>
      saveDownload(
        file,
        entity + (kind === 'template' ? '-template.xlsx' : '.xlsx'),
      ),
  });
  return (
    <div className="grid justify-items-start gap-2">
      <Button
        variant="secondary"
        loading={download.isPending}
        onClick={() => download.mutate()}
      >
        <Download size={20} strokeWidth={1.75} aria-hidden="true" />
        {copy[kind]}
      </Button>
      {download.error && <TransferError error={download.error} />}
    </div>
  );
}

function Counts({
  result,
  committed = false,
}: {
  result: DataPreview;
  committed?: boolean;
}) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-small">
      <div className="flex items-baseline gap-2">
        <dt>{committed ? copy.added : copy.create}</dt>
        <dd className="numeric font-bold">{formatNumber(result.create)}</dd>
      </div>
      <div className="flex items-baseline gap-2">
        <dt>{committed ? copy.updated : copy.update}</dt>
        <dd className="numeric font-bold">{formatNumber(result.update)}</dd>
      </div>
    </dl>
  );
}

function Issues({ errors }: { errors: DataPreview['errors'] }) {
  return (
    <div
      role="region"
      aria-label={copy.errors}
      tabIndex={0}
      className="max-h-96 overflow-auto rounded-control border border-seam"
    >
      <table className="w-full text-start text-small">
        <thead className="sticky top-0 bg-plaster">
          <tr>
            <th scope="col" className="px-2 py-2 text-end">
              {copy.row}
            </th>
            <th scope="col" className="px-2 py-2 text-start">
              {copy.column}
            </th>
            <th scope="col" className="px-2 py-2 text-start">
              {copy.message}
            </th>
          </tr>
        </thead>
        <tbody>
          {errors.map(({ row, column, message, fix }, index) => (
            <tr key={index} className="border-t border-seam align-top">
              <td className="numeric px-2 py-2 text-end">
                {formatNumber(row)}
              </td>
              <td className="px-2 py-2">{dataColumnLabel(column)}</td>
              <td className="px-2 py-2">
                <div>{message}</div>
                <div className="text-concrete">{fix}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportFile({ entity }: { entity: DataEntity }) {
  const input = useRef<HTMLInputElement>(null);
  const status = useId();
  const client = useQueryClient();
  const [file, setFile] = useState<File>();
  const preview = useMutation({
    mutationFn: (current: File) => dataApi.preview(entity, current),
  });
  const commit = useMutation({
    mutationFn: (current: File) => dataApi.commit(entity, current),
    onSuccess: () => {
      if (entity === 'sites') {
        void client.invalidateQueries({ queryKey: ['sites'] });
        void client.invalidateQueries({ queryKey: ['users'] });
      } else void client.invalidateQueries({ queryKey: ['master-data'] });
    },
  });
  function select(next?: File) {
    if (!next || commit.isPending) return;
    setFile(next);
    commit.reset();
    preview.mutate(next);
  }
  const result = preview.data;
  const ready =
    !!result && !result.errors.length && !!(result.create || result.update);
  const blocked = result?.errors.length ? copy.blocked : copy.emptyFile;
  return (
    <>
      <div className="grid gap-2">
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv"
          hidden
          onChange={(event) => {
            select(event.currentTarget.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <Button
          variant="secondary"
          className="min-h-24 flex-col border-dashed"
          disabled={commit.isPending}
          onClick={() => input.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            select(event.dataTransfer.files[0]);
          }}
        >
          <Upload size={20} strokeWidth={1.75} aria-hidden="true" />
          {copy.selectFile}
        </Button>
        <p className="text-small text-concrete">{copy.limits}</p>
        {file && (
          <p className="break-all text-small font-semibold">
            <bdi>{file.name}</bdi>
          </p>
        )}
      </div>
      {preview.isPending && <p role="status">{copy.checking}</p>}
      {preview.error && file && (
        <TransferError error={preview.error} retry={() => select(file)} />
      )}
      {commit.data ? (
        <div
          role="status"
          className="grid gap-2 rounded-control bg-ppr-wash p-3 text-ppr-deep"
        >
          <p className="font-semibold">{copy.success}</p>
          <Counts result={commit.data} committed />
        </div>
      ) : (
        result && (
          <section className="grid min-w-0 gap-2 border-t border-seam pt-4">
            <h3 className="text-section">{copy.preview}</h3>
            <Counts result={result} />
            {!!result.errors.length && <Issues errors={result.errors} />}
            {commit.error && file && (
              <TransferError error={commit.error} retry={() => select(file)} />
            )}
            <p id={status} role="status" className="text-small text-concrete">
              {commit.error ? copy.recheck : ready ? copy.ready : blocked}
            </p>
            <div
              className={
                'grid bg-paper py-2 sm:justify-items-start' +
                (ready && !commit.error ? ' sticky bottom-0 sm:static' : '')
              }
            >
              <Button
                aria-describedby={status}
                loading={commit.isPending}
                disabled={!ready || !!commit.error}
                onClick={() => file && commit.mutate(file)}
              >
                {commit.isPending ? copy.pending : copy.import}
              </Button>
            </div>
          </section>
        )
      )}
    </>
  );
}

export function DataTransfer({
  entity,
  canImport,
  canExport,
}: {
  entity: DataEntity;
  canImport: boolean;
  canExport: boolean;
}) {
  const keys = dataColumns[entity];
  const visibleKeys = entity === 'catalog-items' ? keys.slice(0, 6) : keys;
  return (
    <section className="grid min-w-0 gap-4 rounded-panel border border-seam bg-paper p-4 sm:p-6">
      <div className="grid gap-1">
        <h2 className="text-section">{copy.entities[entity]}</h2>
        <p className="text-small text-concrete">
          {visibleKeys.map(dataColumnLabel).join('، ')}
        </p>
        {entity === 'sites' && (
          <p className="text-small text-concrete">{copy.siteScope}</p>
        )}
        {canImport && entity === 'catalog-items' && (
          <p className="text-small text-concrete">{copy.itemHint}</p>
        )}
        {canImport && entity === 'catalog-tree' && (
          <p className="text-small text-concrete">{copy.treeHint}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {canImport && <DownloadFile entity={entity} kind="template" />}
        {canExport && <DownloadFile entity={entity} kind="export" />}
      </div>
      {canImport && <ImportFile entity={entity} />}
    </section>
  );
}
