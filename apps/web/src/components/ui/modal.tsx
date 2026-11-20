import { ar } from '@purchasing-plus/shared/i18n/ar';
import { X } from 'lucide-react';
import {
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { Button } from './button.js';

const layers: HTMLDialogElement[] = [];
let priorOverflow = '';
const focusable =
  'button:not(:disabled), input:not(:disabled):not([type=hidden]), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';
function controls(dialog: HTMLDialogElement) {
  return [...dialog.querySelectorAll<HTMLElement>(focusable)].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.closest('[hidden], [inert]') &&
      getComputedStyle(el).visibility !== 'hidden' &&
      getComputedStyle(el).display !== 'none',
  );
}
export interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  drawer?: boolean;
  workspace?: boolean;
  fullScreen?: boolean;
  dismissible?: boolean;
}
export function Modal({ open, ...props }: ModalProps) {
  return open ? <Dialog {...props} /> : null;
}
function Dialog({
  title,
  description,
  icon,
  children,
  onClose,
  drawer,
  workspace,
  fullScreen,
  dismissible = true,
}: Omit<ModalProps, 'open'>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const startedOnBackdrop = useRef(false);

  useLayoutEffect(() => {
    const element = dialog.current!;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (layers.length === 0) {
      priorOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    layers.push(element);
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
    (
      element.querySelector<HTMLElement>('[data-initial-focus]') ??
      element.querySelector<HTMLElement>('[data-dialog-title]')
    )?.focus();
    return () => {
      const wasTop = layers.at(-1) === element;
      const index = layers.indexOf(element);
      if (index !== -1) layers.splice(index, 1);
      if (typeof element.close === 'function') element.close();
      else element.removeAttribute('open');
      if (layers.length === 0) {
        document.body.style.overflow = priorOverflow;
      }
      if (wasTop && trigger?.isConnected) trigger.focus();
    };
  }, []);

  function closeTop() {
    if (dismissible && layers.at(-1) === dialog.current) onClose();
  }
  function keyDown(event: KeyboardEvent<HTMLDialogElement>) {
    const element = event.currentTarget;
    if (layers.at(-1) !== element || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeTop();
    }
    if (event.key !== 'Tab') return;
    const items = controls(element);
    const first = items.at(0);
    const last = items.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (
      event.shiftKey
        ? active === first || !items.includes(active as HTMLElement)
        : active === last
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={`ui-dialog fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent text-ink ${fullScreen ? 'items-stretch' : drawer ? 'items-stretch justify-start' : 'items-end justify-center sm:items-center sm:p-6'}`}
      onKeyDown={keyDown}
      onCancel={(event) => {
        event.preventDefault();
        closeTop();
      }}
      onPointerDown={(event) => {
        startedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (startedOnBackdrop.current && event.target === event.currentTarget)
          closeTop();
      }}
    >
      <section
        className={`ui-dialog-panel flex min-w-0 flex-col overflow-hidden shadow-overlay ${fullScreen ? 'h-dvh w-full bg-paper' : drawer ? 'h-full w-[min(86vw,320px)] bg-ink text-paper' : workspace ? 'h-dvh w-full bg-paper sm:h-auto sm:max-h-[90dvh] sm:max-w-4xl sm:rounded-panel' : 'max-h-[90dvh] w-full rounded-t-sheet bg-paper sm:max-w-lg sm:rounded-panel'}`}
      >
        <header
          className={`flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 ${drawer ? 'border-paper/20' : 'border-seam'}`}
        >
          <h2
            data-dialog-title
            tabIndex={-1}
            id={titleId}
            className="flex items-center gap-2 text-section"
          >
            {icon}
            {title}
          </h2>
          {dismissible && (
            <Button
              variant="ghost"
              iconOnly
              className={drawer ? 'hover:bg-paper/10' : undefined}
              aria-label={ar.common.close}
              onClick={closeTop}
            >
              <X size={20} strokeWidth={1.75} />
            </Button>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {description && (
            <p
              id={descriptionId}
              className={`mb-4 ${drawer ? 'text-paper/80' : 'text-concrete'}`}
            >
              {description}
            </p>
          )}
          {children}
        </div>
      </section>
    </dialog>
  );
}
