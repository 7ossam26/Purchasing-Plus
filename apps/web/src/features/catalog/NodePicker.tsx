import { ar, masterData as copy } from '@purchasing-plus/shared/i18n/ar';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { LoadRecord } from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { Modal } from '../../components/ui/modal.js';
import { EmptyState } from '../../components/ui/states.js';
import { treeApi } from '../../lib/api/catalog-tree.js';
import { catalogApi, type NamedRecord } from '../../lib/api/catalog.js';

import { CategoryIcon, pathLabel } from './presentation.js';

type Scope = { categoryId: number; excludeId?: number; currentId?: number };
export function NodePicker({
  title,
  scope,
  tree = false,
  onPick,
  onClose,
}: {
  title: string;
  scope?: Scope;
  tree?: boolean;
  onPick: (path: NamedRecord[]) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState<NamedRecord[]>([]);
  const current = path.at(-1);
  const query = useQuery({
    queryKey: ['master-data', 'destination', tree, current?.id ?? null],
    queryFn: ({ signal }) =>
      tree
        ? treeApi.list(current?.id ?? null, signal)
        : current
          ? catalogApi.folders(current.id, false, signal)
          : catalogApi.categories(false, signal),
  });
  const allowed = (node: NamedRecord) =>
    node.isActive &&
    node.id !== scope?.excludeId &&
    (current !== undefined || !scope || node.id === scope.categoryId);

  return (
    <Modal open title={title} onClose={onClose}>
      <div className="grid gap-3">
        {current && (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setPath(path.slice(0, -1))}
            >
              {copy.upFolder}
            </Button>
            <bdi className="min-w-0 wrap-anywhere text-small">
              {pathLabel(path)}
            </bdi>
          </div>
        )}
        <LoadRecord query={query}>
          {(folders) => {
            const eligible = folders.filter(allowed);
            return eligible.length ? (
              <ul className="divide-y divide-seam rounded-panel border border-seam">
                {eligible.map((folder) => (
                  <li key={folder.id}>
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-start"
                      onClick={() => setPath([...path, folder])}
                    >
                      <CategoryIcon name={folder.iconKey} size={19} />
                      <bdi className="min-w-0 flex-1 wrap-anywhere">
                        {folder.name}
                      </bdi>
                      <ChevronRight
                        className="rtl-mirror shrink-0"
                        size={18}
                        aria-hidden="true"
                      />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title={current ? copy.emptyFolder : copy.emptyDestinations}
              />
            );
          }}
        </LoadRecord>
        {current && current.id !== scope?.currentId && (
          <Button className="justify-self-start" onClick={() => onPick(path)}>
            {scope?.currentId === undefined ? copy.chooseHere : copy.moveHere}
          </Button>
        )}
        <Button
          variant="secondary"
          className="justify-self-start"
          onClick={onClose}
        >
          {ar.common.cancel}
        </Button>
      </div>
    </Modal>
  );
}
