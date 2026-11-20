import { ar } from '@purchasing-plus/shared/i18n/ar';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Button } from './button.js';
import { Field, Input, Textarea } from './field.js';
import { Modal } from './modal.js';

interface Options {
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
}
interface PromptOptions extends Options {
  label?: string;
  initialValue?: string;
  required?: boolean;
  mode?: 'value' | 'reason';
}
interface DialogActions {
  confirm: (options: Options) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}
type Pending = {
  id: number;
  options: PromptOptions;
  isPrompt: boolean;
  finish: (value: string | null) => void;
};
const DialogContext = createContext<DialogActions | null>(null);
export function DialogProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<Pending[]>([]);
  const pending = useRef(new Map<number, Pending>());
  const sequence = useRef(0);
  useEffect(() => {
    const outstanding = pending.current;
    return () => {
      for (const request of outstanding.values()) request.finish(null);
      outstanding.clear();
    };
  }, []);
  const ask = useCallback(
    (options: PromptOptions, isPrompt: boolean) =>
      new Promise<string | null>((resolve) => {
        const id = ++sequence.current;
        const request: Pending = {
          id,
          options,
          isPrompt,
          finish: (value) => {
            if (!pending.current.delete(id)) return;
            setRequests((previous) =>
              previous.filter((item) => item.id !== id),
            );
            resolve(value);
          },
        };
        pending.current.set(id, request);
        setRequests((previous) => [...previous, request]);
      }),
    [],
  );
  const actions = useMemo<DialogActions>(
    () => ({
      confirm: async (options) => (await ask(options, false)) !== null,
      prompt: (options) => ask(options, true),
    }),
    [ask],
  );
  return (
    <DialogContext.Provider value={actions}>
      {children}
      {requests.map((request) => (
        <Question key={request.id} request={request} />
      ))}
    </DialogContext.Provider>
  );
}
function Question({ request }: { request: Pending }) {
  const { options, finish, isPrompt } = request;
  const [value, setValue] = useState(options.initialValue ?? '');
  const reason = options.mode === 'reason';
  const required = reason || options.required;
  const blocked = isPrompt && required && !value.trim();
  const Control = reason ? Textarea : Input;
  return (
    <Modal
      open
      title={options.title}
      description={options.description}
      onClose={() => finish(null)}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!blocked) finish(value.trim());
        }}
      >
        {isPrompt && (
          <Field
            label={
              options.label ?? (reason ? ar.dialogs.reason : ar.dialogs.value)
            }
            required={required}
            hint={reason ? ar.dialogs.reasonHint : undefined}
          >
            {(props) => (
              <Control
                {...props}
                data-initial-focus
                value={value}
                onChange={(event) => setValue(event.currentTarget.value)}
              />
            )}
          </Field>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => finish(null)}>
            {ar.common.cancel}
          </Button>
          <Button
            type="submit"
            disabled={blocked}
            variant={options.tone === 'danger' ? 'danger-outline' : 'primary'}
          >
            {options.confirmLabel ?? ar.common.confirm}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function useDialogs() {
  const actions = useContext(DialogContext);
  if (!actions) throw new Error('DialogProvider is required');
  return actions;
}
export function useConfirm() {
  return useDialogs().confirm;
}
export function usePrompt() {
  return useDialogs().prompt;
}
