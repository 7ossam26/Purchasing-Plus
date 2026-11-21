import { supportUi } from '@purchasing-plus/shared/i18n/ar';

import { Modal } from '../../components/ui/modal.js';
import type { AuditRow } from '../../lib/api/support.js';

const copy = supportUi.audit;

function toFields(value: AuditRow['oldValue']) {
  if (value === null) return new Map<string, AuditRow['oldValue']>();
  if (typeof value === 'object' && !Array.isArray(value))
    return new Map(Object.entries(value));
  return new Map([['', value]]);
}

export function AuditDetail({
  row,
  close,
}: {
  row: AuditRow;
  close: () => void;
}) {
  const previous = toFields(row.oldValue);
  const next = toFields(row.newValue);
  const keys = [...new Set([...previous.keys(), ...next.keys()])].sort();
  return (
    <Modal
      open
      detailDrawer
      title={copy.detailTitle}
      description={row.actorLabel ?? undefined}
      onClose={close}
    >
      {keys.length === 0 ? (
        <p>{copy.none}</p>
      ) : (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 px-2 text-small font-semibold">
            <span>{copy.before}</span>
            <span>{copy.after}</span>
          </div>
          <dl className="grid gap-3">
            {keys.map((key) => {
              const before = JSON.stringify(previous.get(key), null, 2);
              const after = JSON.stringify(next.get(key), null, 2);
              const changed = before !== after;
              return (
                <div
                  key={key}
                  className="min-w-0 rounded-control border border-seam"
                >
                  <dt className="flex flex-wrap items-center justify-between gap-2 border-b border-seam px-2 py-1 text-small font-semibold">
                    <bdi className="wrap-anywhere">{key || copy.key}</bdi>
                    {changed && <span>{copy.changed}</span>}
                  </dt>
                  <dd className="m-0 grid grid-cols-2">
                    {[before, after].map((value, index) => (
                      <div
                        key={index}
                        className={`min-w-0 p-2 ${changed ? (index === 0 ? 'bg-danger-bg' : 'bg-ppr-wash') : ''}`}
                      >
                        {value === undefined ? (
                          <span className="text-small text-concrete">
                            {copy.absent}
                          </span>
                        ) : (
                          <pre
                            dir="auto"
                            className="wrap-anywhere whitespace-pre-wrap text-small"
                          >
                            {value}
                          </pre>
                        )}
                      </div>
                    ))}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
    </Modal>
  );
}
