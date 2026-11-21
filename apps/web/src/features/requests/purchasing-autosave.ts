import { purchasingUi as copy } from '@purchasing-plus/shared/i18n/ar';
import { useEffect, useRef, useState } from 'react';

export type SaveStatus = 'dirty' | 'saving' | 'failed' | 'incomplete';
export type ReportSave = (key: string, status: SaveStatus | null) => void;

export function usePurchaseAutosave<T>({
  key,
  saved,
  valid,
  equal,
  deliver,
  report,
}: {
  key: string;
  saved: T;
  valid: (value: T) => boolean;
  equal: (a: T, b: T) => boolean;
  deliver: (value: T) => Promise<unknown>;
  report: ReportSave;
}) {
  const [pending, setPending] = useState<{ value: T }>();
  const [status, setStatus] = useState<SaveStatus | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const job = useRef<{ value: T } | undefined>(undefined);
  const inFlight = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      job.current = undefined;
      report(key, null);
    },
    [key, report],
  );

  function updateStatus(next: SaveStatus | null) {
    setStatus(next);
    report(key, next);
  }
  function reset() {
    clearTimeout(timer.current);
    job.current = undefined;
    setPending(undefined);
    setError(null);
    updateStatus(null);
  }
  async function save(attempt: { value: T }) {
    if (job.current !== attempt || !valid(attempt.value)) return;
    updateStatus('saving');
    inFlight.current++;
    try {
      await deliver(attempt.value);
      if (job.current === attempt) reset();
    } catch (error) {
      if (job.current === attempt) {
        setError(error instanceof Error ? error : new Error(copy.fixSave));
        updateStatus('failed');
      }
    } finally {
      inFlight.current--;
    }
  }
  function set(value: T) {
    clearTimeout(timer.current);
    if (!inFlight.current && equal(value, saved)) {
      reset();
      return;
    }
    const next = { value };
    job.current = next;
    setPending(next);
    setError(null);
    const ready = valid(value);
    updateStatus(ready ? 'dirty' : 'incomplete');
    if (ready) timer.current = setTimeout(() => void save(next), 500);
  }
  return {
    value: pending?.value ?? saved,
    status,
    error,
    set,
    reset,
    retry: () => {
      if (job.current) void save(job.current);
    },
  };
}
