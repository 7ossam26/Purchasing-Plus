import { ar, masterData as copy } from '@purchasing-plus/shared/i18n/ar';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  GripVertical,
} from 'lucide-react';
import { useState } from 'react';

import { useCan } from '../../app/session.js';
import {
  InlineError,
  LoadRecord,
} from '../../components/shared/record-feedback.js';
import { RecordManager } from '../../components/shared/record-manager.js';
import { Button } from '../../components/ui/button.js';
import { EmptyState } from '../../components/ui/states.js';
import { toast } from '../../components/ui/toast.js';
import {
  CatalogActions,
  FolderForm,
} from '../../features/catalog/CatalogActions.js';
import { CategoryIcon, Stopped } from '../../features/catalog/presentation.js';
import { treeApi } from '../../lib/api/catalog-tree.js';

export function TreePage() {
  const canCreate = useCan('catalogTree.create');
  const [adding, setAdding] = useState(false);
  return (
    <RecordManager
      title={copy.tree}
      parent="/master-data"
      add={
        canCreate
          ? {
              id: 'add',
              label: copy.addCategory,
              onClick: () => setAdding(true),
            }
          : undefined
      }
    >
      <TreeLevel parentId={null} depth={0} ancestorsActive />
      {adding && canCreate && <FolderForm onClose={() => setAdding(false)} />}
    </RecordManager>
  );
}
function TreeLevel({
  parentId,
  depth,
  ancestorsActive,
}: {
  parentId: number | null;
  depth: number;
  ancestorsActive: boolean;
}) {
  const canReorder = useCan('catalogTree.edit');
  const [expanded, setExpanded] = useState<number[]>([]);
  const [dragging, setDragging] = useState<number>();
  const [target, setTarget] = useState<number>();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['master-data', 'tree', parentId],
    queryFn: ({ signal }) => treeApi.list(parentId, signal),
  });
  const change = useMutation({
    mutationFn: (ids: number[]) => treeApi.reorder(parentId, ids),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['master-data'] });
      toast.success(copy.saved);
    },
  });
  function reorder(ids: number[], from: number, to: number) {
    if (from === to || from < 0 || to < 0 || change.isPending) return;
    const [moved] = ids.splice(from, 1);
    if (!moved) return;
    ids.splice(to, 0, moved);
    change.mutate(ids);
  }
  function finishDrag() {
    setDragging(undefined);
    setTarget(undefined);
  }
  return (
    <>
      <InlineError error={change.error} />
      <LoadRecord query={query}>
        {(folders) => {
          const ids = folders.map(({ id }) => id);
          return !folders.length ? (
            <EmptyState
              title={
                parentId === null ? copy.emptyCategories : copy.emptyFolder
              }
            />
          ) : (
            <ul className={depth < 4 ? 'grid gap-2' : 'grid gap-1'}>
              {folders.map((folder, index) => {
                const open = expanded.includes(folder.id);
                return (
                  <li key={folder.id}>
                    <div
                      className={`flex flex-wrap items-center gap-1 rounded-control border p-1 sm:flex-nowrap ${target === folder.id ? 'border-ppr bg-ppr-wash' : 'border-seam bg-paper'}`}
                      onDragOver={(event) => {
                        if (
                          !canReorder ||
                          dragging === undefined ||
                          change.isPending
                        )
                          return;
                        event.preventDefault();
                        setTarget(folder.id);
                      }}
                      onDragLeave={() => setTarget(undefined)}
                      onDrop={(event) => {
                        if (!canReorder || dragging === undefined) return;
                        event.preventDefault();
                        reorder(ids.slice(), ids.indexOf(dragging), index);
                        finishDrag();
                      }}
                    >
                      {canReorder && (
                        <span
                          className="hidden size-target shrink-0 cursor-grab place-items-center text-concrete sm:grid"
                          draggable={!change.isPending}
                          aria-hidden="true"
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData(
                              'text/plain',
                              String(folder.id),
                            );
                            event.stopPropagation();
                            setDragging(folder.id);
                          }}
                          onDragEnd={finishDrag}
                        >
                          <GripVertical size={20} />
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        aria-expanded={open}
                        aria-label={
                          (open ? copy.collapse : copy.expand) +
                          ' ' +
                          folder.name
                        }
                        className="gap-1 px-2"
                        onClick={() =>
                          setExpanded(
                            open
                              ? expanded.filter((id) => id !== folder.id)
                              : [...expanded, folder.id],
                          )
                        }
                      >
                        {open ? (
                          <ChevronDown size={15} aria-hidden="true" />
                        ) : (
                          <ChevronLeft size={15} aria-hidden="true" />
                        )}
                        <CategoryIcon name={folder.iconKey} size={19} />
                      </Button>
                      <span className="min-w-20 flex-1 wrap-anywhere font-semibold">
                        {folder.name}
                      </span>
                      {folder.codePrefix && (
                        <bdi className="text-small text-concrete" dir="ltr">
                          {folder.codePrefix}
                        </bdi>
                      )}
                      <Stopped active={folder.isActive} />
                      {canReorder && (
                        <div className="flex shrink-0">
                          {index > 0 && (
                            <Button
                              variant="ghost"
                              iconOnly
                              aria-label={copy.moveUp + ' ' + folder.name}
                              disabled={change.isPending}
                              onClick={() =>
                                reorder(ids.slice(), index, index - 1)
                              }
                            >
                              <ChevronUp size={19} aria-hidden="true" />
                            </Button>
                          )}
                          {index < folders.length - 1 && (
                            <Button
                              variant="ghost"
                              iconOnly
                              aria-label={copy.moveDown + ' ' + folder.name}
                              disabled={change.isPending}
                              onClick={() =>
                                reorder(ids.slice(), index, index + 1)
                              }
                            >
                              <ChevronDown size={19} aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      )}
                      <CatalogActions
                        folder={folder}
                        ancestorsActive={ancestorsActive}
                      />
                    </div>
                    {open && (
                      <div
                        className={
                          depth < 4
                            ? 'ms-2 mt-2 border-s border-seam ps-2 sm:ms-5 sm:ps-4'
                            : 'mt-2'
                        }
                      >
                        <TreeLevel
                          parentId={folder.id}
                          depth={depth + 1}
                          ancestorsActive={ancestorsActive && folder.isActive}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          );
        }}
      </LoadRecord>
      {change.isPending && (
        <p role="status" className="text-small text-concrete">
          {ar.common.loading}
        </p>
      )}
    </>
  );
}
