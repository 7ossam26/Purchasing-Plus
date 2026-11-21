import {
  formatNumber,
  maintenanceActions,
  type AuditProgress,
  type MaintenanceAction,
  type MaintenanceConfirmation,
} from '@purchasing-plus/shared';
import { ar, supportUi as copy } from '@purchasing-plus/shared/i18n/ar';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { InlineError } from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { Field, Input } from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { toast } from '../../components/ui/toast.js';
import { supportApi } from '../../lib/api/support.js';

function Confirmation({
  action,
  saving,
  error,
  close,
  submit,
}: {
  action: MaintenanceAction;
  saving: boolean;
  error: Error | null;
  close: () => void;
  submit: (body: MaintenanceConfirmation) => void;
}) {
  const metadata = copy.actions[action];
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const blocked = phrase !== metadata.phrase || !password;
  return (
    <Modal
      open
      title={metadata.title}
      description={metadata.consequence}
      dismissible={!saving}
      onClose={close}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (blocked || saving) return;
          submit({ phrase, password });
          setPassword('');
        }}
      >
        <Field label={copy.typePhrase} hint={metadata.phrase} required>
          {(props) => (
            <Input
              {...props}
              data-initial-focus
              autoComplete="off"
              maxLength={100}
              value={phrase}
              onChange={(event) => setPhrase(event.currentTarget.value)}
            />
          )}
        </Field>
        <Field label={ar.auth.currentPassword} required>
          {(props) => (
            <Input
              {...props}
              type="password"
              dir="ltr"
              autoComplete="current-password"
              maxLength={512}
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          )}
        </Field>
        {phrase !== metadata.phrase && (
          <p className="text-small text-concrete">{copy.phraseHint}</p>
        )}
        <InlineError error={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={saving} onClick={close}>
            {ar.common.cancel}
          </Button>
          <Button
            type="submit"
            disabled={blocked}
            loading={saving}
            variant={
              action === 'reset-operational-data' ||
              action === 'purge-notifications'
                ? 'danger-outline'
                : 'primary'
            }
          >
            {ar.common.confirm}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function MaintenancePage() {
  const [action, setAction] = useState<MaintenanceAction | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState<AuditProgress | null>(null);
  const operation = useRef<AbortController | null>(null);
  const client = useQueryClient();

  useEffect(() => () => operation.current?.abort(), []);

  async function run(
    action: MaintenanceAction,
    confirmation: MaintenanceConfirmation,
  ) {
    const controller = new AbortController();
    operation.current = controller;
    setRunning(true);
    setProgress(null);
    setError(null);
    try {
      await supportApi.maintain(
        action,
        confirmation,
        controller.signal,
        (frame) => {
          setAction(null);
          setProgress(frame);
        },
      );
      setAction(null);
      toast.success(copy.actions[action].success);
      await client.invalidateQueries({
        predicate: (query) =>
          !['session', 'settings'].includes(String(query.queryKey[0])),
      });
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure
            : new Error(ar.common.fallbackError),
        );
    } finally {
      if (!controller.signal.aborted) setRunning(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-4">
      <h1 className="text-title sm:text-title-wide">{copy.maintenance}</h1>
      <div className="divide-y divide-seam rounded-panel border border-seam bg-paper">
        {maintenanceActions.map((item) => {
          const metadata = copy.actions[item];
          return (
            <section
              key={item}
              className="grid items-start gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div>
                <h2 className="text-section">{metadata.title}</h2>
                <p className="text-concrete">{metadata.consequence}</p>
              </div>
              <Button
                className="justify-self-start"
                disabled={running}
                variant={
                  item === 'reset-operational-data' ||
                  item === 'purge-notifications'
                    ? 'danger-outline'
                    : 'secondary'
                }
                onClick={() => {
                  setError(null);
                  setAction(item);
                }}
              >
                {metadata.button}
              </Button>
              {item === 'verify-audit-log' && progress && (
                <div className="grid gap-2 sm:col-span-2">
                  <progress
                    className="h-2 w-full appearance-none overflow-hidden rounded-full bg-seam [&::-moz-progress-bar]:bg-ppr [&::-webkit-progress-bar]:bg-seam [&::-webkit-progress-value]:bg-ppr"
                    aria-label={metadata.title}
                    max={progress.total || 1}
                    value={
                      progress.total ? progress.checked : Number(progress.done)
                    }
                  />
                  <p
                    role="status"
                    className={
                      progress.mismatches ? 'text-danger-fg' : 'text-concrete'
                    }
                  >
                    {copy.progress(
                      formatNumber(progress.checked),
                      formatNumber(progress.total),
                    )}{' '}
                    {copy.auditResult(formatNumber(progress.mismatches))}
                  </p>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {running && !action && (
        <p className="text-small text-concrete">{copy.running}</p>
      )}
      {!action && <InlineError error={error} />}
      {action && (
        <Confirmation
          key={action}
          action={action}
          saving={running}
          error={error}
          close={() => {
            setAction(null);
            setError(null);
          }}
          submit={(body) => void run(action, body)}
        />
      )}
    </div>
  );
}
