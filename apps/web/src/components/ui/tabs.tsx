import { formatNumber } from '@purchasing-plus/shared';
import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { NavLink } from 'react-router';

interface TabLabel {
  label: string;
  count?: number;
}
interface Segment extends TabLabel {
  id: string;
  content: ReactNode;
}
interface RouteTab extends TabLabel {
  to: string;
}
type TabsProps = { label: string } & (
  | {
      variant?: 'segmented';
      tabs: readonly Segment[];
      value: string;
      onChange: (value: string) => void;
    }
  | { variant: 'route'; tabs: readonly RouteTab[] }
);
// Selected = accent wash plus a solid accent edge, so the open tab reads at a glance in sunlight.
const tabClass =
  'group/tab inline-flex min-h-target min-w-target shrink-0 items-center justify-center gap-2 rounded-control px-3 py-2 text-small font-semibold text-concrete transition-[background-color,color,box-shadow] hover:bg-plaster hover:text-ink ' +
  'aria-selected:bg-ppr-wash aria-selected:font-bold aria-selected:text-ppr-deep aria-selected:shadow-[inset_0_-3px_0_var(--color-ppr)] ' +
  'aria-[current=page]:bg-ppr-wash aria-[current=page]:font-bold aria-[current=page]:text-ppr-deep aria-[current=page]:shadow-[inset_0_-3px_0_var(--color-ppr)]';
function Label({ label, count }: TabLabel) {
  return (
    <>
      {label}
      {count !== undefined && (
        <bdi className="numeric rounded-full bg-neutral-bg px-2 text-micro text-neutral-fg group-aria-selected/tab:bg-ppr group-aria-selected/tab:text-paper group-aria-[current=page]/tab:bg-ppr group-aria-[current=page]/tab:text-paper">
          {formatNumber(count)}
        </bdi>
      )}
    </>
  );
}
export function Tabs(props: TabsProps) {
  const id = useId();
  if (props.variant === 'route')
    return (
      <nav
        aria-label={props.label}
        className="chip-strip flex gap-1 overflow-x-auto rounded-control border border-seam bg-paper p-1"
      >
        {props.tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end className={tabClass}>
            <Label {...tab} />
          </NavLink>
        ))}
      </nav>
    );
  const { tabs, value, onChange } = props;

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const rtl =
      getComputedStyle(event.currentTarget).direction === 'rtl' ||
      event.currentTarget.closest('[dir]')?.getAttribute('dir') === 'rtl';
    const step = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : rtl ? 1 : -1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : ['ArrowRight', 'ArrowLeft'].includes(event.key)
            ? (index + step + tabs.length) % tabs.length
            : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const tab = tabs[next];
    if (tab) {
      onChange(tab.id);
      document.getElementById(id + '-' + tab.id)?.focus();
    }
  }
  return (
    <div className="grid gap-2">
      <div
        role="tablist"
        aria-label={props.label}
        className="chip-strip flex gap-1 overflow-x-auto rounded-control border border-seam bg-paper p-1"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={id + '-' + tab.id}
            aria-controls={id + '-panel-' + tab.id}
            aria-selected={value === tab.id}
            tabIndex={value === tab.id ? 0 : -1}
            className={tabClass}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => navigate(event, index)}
          >
            <Label {...tab} />
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={id + '-panel-' + tab.id}
          aria-labelledby={id + '-' + tab.id}
          hidden={tab.id !== value}
          tabIndex={tab.id === value ? 0 : -1}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
