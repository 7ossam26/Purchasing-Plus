import {
  recordDestinations,
  reportDestinations,
} from '@purchasing-plus/shared';
import { reportsUi as copy } from '@purchasing-plus/shared/i18n/ar';
import { Link } from 'react-router';

import { ModuleIcon } from '../app/module-icon.js';
import { can, useSession } from '../app/session.js';

function Tile({
  path,
  icon,
  title,
  description,
  compact,
}: {
  path: string;
  icon: string;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <li>
      <Link
        to={path}
        className={
          'flex h-full gap-3 rounded-panel border border-seam bg-paper p-4 hover:border-concrete hover:bg-neutral-bg ' +
          (compact ? 'items-center' : 'flex-col items-start sm:min-h-44 sm:p-5')
        }
      >
        <span className="grid size-target shrink-0 place-items-center rounded-control bg-plaster">
          <ModuleIcon name={icon} />
        </span>
        <span className="min-w-0">
          <span className="block text-subtitle">{title}</span>
          <span className="block text-small text-concrete">{description}</span>
        </span>
      </Link>
    </li>
  );
}

export function ReportsHub() {
  const { profile } = useSession();
  const reports = reportDestinations.filter(([, key]) => can(profile, key));
  return (
    <div className="mx-auto grid max-w-5xl gap-8">
      <header className="grid justify-items-center gap-2 py-4 text-center">
        <h1 className="text-title sm:text-title-wide">{copy.title}</h1>
        <p className="max-w-prose text-body text-concrete">
          {copy.description}
        </p>
      </header>
      {reports.length > 0 && (
        <section aria-labelledby="reports" className="grid gap-3">
          <h2 id="reports" className="text-section">
            {copy.reports}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reports.map(([id, , icon]) => (
              <Tile
                key={id}
                path={'/reports/' + id}
                icon={icon}
                {...copy.destinations[id]}
              />
            ))}
          </ul>
        </section>
      )}
      {can(profile, 'records.view') && (
        <section aria-labelledby="records" className="grid gap-3">
          <h2 id="records" className="text-section">
            {copy.records}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recordDestinations.map(([id, icon]) => (
              <Tile
                compact
                key={id}
                path={'/reports/records/' + id}
                icon={icon}
                {...copy.logs[id]}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
