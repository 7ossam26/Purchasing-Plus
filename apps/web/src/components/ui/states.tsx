import type { ReactNode } from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block h-5 rounded-thumbnail bg-neutral-bg ${className}`}
    />
  );
}
export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-2 px-4 py-6 text-center">
      {icon && (
        <span aria-hidden="true" className="text-concrete">
          {icon}
        </span>
      )}
      <p className="text-subtitle">{title}</p>
      {description && <p className="text-small text-concrete">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
