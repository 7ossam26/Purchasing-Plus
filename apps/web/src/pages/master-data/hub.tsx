import { admin, ar, masterData as copy } from '@purchasing-plus/shared/i18n/ar';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import {
  ChevronRight,
  FolderTree,
  MapPin,
  Package,
  Ruler,
  SlidersHorizontal,
  Truck,
} from 'lucide-react';
import { Link } from 'react-router';

import { can, useSession } from '../../app/session.js';
import { EmptyState } from '../../components/ui/states.js';

const tiles = [
  ['catalog.view', '/catalog', Package, copy.items, copy.itemsDescription],
  [
    'catalogTree.view',
    '/master-data/tree',
    FolderTree,
    copy.tree,
    copy.treeDescription,
  ],
  [
    'attributes.view',
    '/master-data/attributes',
    SlidersHorizontal,
    copy.attributes,
    copy.attributesDescription,
  ],
  [
    'units.view',
    '/master-data/units',
    Ruler,
    copy.units,
    copy.unitsDescription,
  ],
  [
    'suppliers.view',
    '/master-data/suppliers',
    Truck,
    copy.suppliers,
    copy.suppliersDescription,
  ],
  [
    'sites.view',
    '/master-data/sites',
    MapPin,
    admin.sites,
    copy.sitesDescription,
  ],
] as const satisfies readonly (readonly [
  PermissionKey,
  string,
  typeof Package,
  string,
  string,
])[];

export function MasterDataPage() {
  const { profile } = useSession();
  const available = tiles.filter(([key]) => can(profile, key));
  return (
    <section className="mx-auto max-w-5xl">
      <header className="pb-6 pt-3 text-center sm:pb-8 sm:pt-6">
        <h1 className="text-title sm:text-title-wide">{copy.hub}</h1>
        <p className="mt-1 text-concrete">{copy.intro}</p>
      </header>
      {available.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {available.map(([key, path, Icon, title, description]) => (
            <li key={key}>
              <Link
                to={path}
                className="flex h-full items-center gap-3 rounded-panel border border-seam bg-paper p-4 hover:border-concrete hover:bg-neutral-bg"
              >
                <span className="grid size-target shrink-0 place-items-center rounded-control bg-plaster">
                  <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-subtitle">{title}</span>
                  <span className="block text-small text-concrete">
                    {description}
                  </span>
                </span>
                <ChevronRight
                  className="rtl-mirror shrink-0 text-concrete"
                  size={20}
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={ar.navigation.noModules}
          description={ar.navigation.contactAdmin}
        />
      )}
    </section>
  );
}
