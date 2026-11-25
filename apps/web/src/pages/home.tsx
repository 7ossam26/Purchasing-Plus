import { ar } from '@purchasing-plus/shared/i18n/ar';
import { modules } from '@purchasing-plus/shared/permissions';
import { ChevronRight, FolderOpen } from 'lucide-react';
import { Link } from 'react-router';

import { ModuleIcon } from '../app/module-icon.js';
import { can, useSession } from '../app/session.js';
import { EmptyState } from '../components/ui/states.js';
import { HomeInbox } from '../features/inbox/home-inbox.js';

export function HomePage() {
  const { profile } = useSession();
  const available = modules.filter(
    (item) => !item.parent && item.anyOf.some((key) => can(profile, key)),
  );
  return (
    <div className="mx-auto grid min-w-0 max-w-5xl gap-8">
      <h1 className="sr-only">
        <bdi dir="ltr">{ar.appName}</bdi>
      </h1>
      <HomeInbox />
      <section aria-labelledby="home-modules" className="grid gap-3">
        <h2 id="home-modules" className="text-section">
          {ar.navigation.modules}
        </h2>
        {available.length === 0 ? (
          <div className="rounded-panel border border-seam bg-paper">
            <EmptyState
              title={ar.navigation.noModules}
              description={ar.navigation.contactAdmin}
              icon={<FolderOpen size={24} strokeWidth={1.75} />}
            />
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((item) => (
              <li key={item.id}>
                <Link
                  className="flex h-full items-center gap-3 rounded-panel border border-seam bg-paper p-4 transition-colors hover:border-concrete hover:bg-plaster"
                  to={item.path}
                >
                  <span className="grid size-target shrink-0 place-items-center rounded-control bg-plaster">
                    <ModuleIcon name={item.icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-subtitle">{item.label}</span>
                    <span className="block text-small text-concrete">
                      {item.description}
                    </span>
                  </span>
                  <ChevronRight
                    className="rtl-mirror shrink-0 text-concrete"
                    size={20}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
