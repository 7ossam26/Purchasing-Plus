import { admin, ar, masterData as copy } from '@purchasing-plus/shared/i18n/ar';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ellipsis } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useCan } from '../../app/session.js';
import {
  InlineError,
  LoadRecord,
} from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { ChipSelect } from '../../components/ui/choice.js';
import { useConfirm } from '../../components/ui/dialogs.js';
import { Field, Input, Select } from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { toast } from '../../components/ui/toast.js';
import { attributesApi } from '../../lib/api/attributes.js';
import { treeApi } from '../../lib/api/catalog-tree.js';
import {
  catalogApi,
  type CatalogItem,
  type Folder,
} from '../../lib/api/catalog.js';
import { ApiError } from '../../lib/api/client.js';

import { NodePicker } from './NodePicker.js';
import {
  categoryIcons,
  CategoryIcon,
  itemUrl,
  nodeUrl,
} from './presentation.js';

type RecordTarget =
  | { folder: Folder; item?: never; ancestorsActive?: boolean }
  | { item: CatalogItem; folder?: never; ancestorsActive?: never };

export function CatalogActions({
  folder,
  item,
  ancestorsActive = true,
}: RecordTarget) {
  const addGroup = useCan('catalogTree.create');
  const editGroup = useCan('catalogTree.edit');
  const deleteGroup = useCan('catalogTree.delete');
  const addItem = useCan('catalog.create');
  const editItem = useCan('catalog.edit');
  const deleteItem = useCan('catalog.delete');
  const defaults = useCan('attributes.edit');
  const [panel, setPanel] = useState<
    'menu' | 'edit' | 'group' | 'move' | 'defaults' | null
  >(null);
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const record = folder ?? item!;
  const categoryId = folder
    ? Number(folder.path.split('/')[1])
    : item!.nodePath[0]!.id;
  const parentId = folder ? folder.parentId : item!.nodeId;
  const canEdit = folder ? editGroup : editItem;
  const canDelete = folder ? deleteGroup : deleteItem;
  const folderActive = folder
    ? ancestorsActive && folder.isActive
    : item!.nodePath.every(({ isActive }) => isActive);
  const nonempty = Boolean(
    folder && (folder.childGroupCount || folder.subtreeItemCount),
  );
  const change = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['master-data'] });
      setPanel(null);
      toast.success(copy.saved);
    },
  });
  const deactivate = () =>
    folder ? treeApi.deactivate(folder.id) : catalogApi.deactivate(item!.id);
  const reactivate = () =>
    folder
      ? treeApi.edit(folder.id, { isActive: true })
      : catalogApi.edit(item!.id, { isActive: true });
  async function stop() {
    if (
      await confirm({
        title: copy.deactivateTitle,
        description: copy.deactivateDetail,
        confirmLabel: copy.deactivate,
        tone: 'danger',
      })
    )
      change.mutate(deactivate);
  }
  async function remove() {
    if (!folder) return;
    if (nonempty) {
      await offerStop();
    } else if (
      await confirm({
        title: copy.deleteTitle,
        description: copy.deleteDetail,
        confirmLabel: ar.common.delete,
        tone: 'danger',
      })
    ) {
      try {
        await change.mutateAsync(() => treeApi.remove(folder.id));
      } catch (error) {
        if (error instanceof ApiError && error.code === 'NODE_NOT_EMPTY') {
          change.reset();
          await offerStop();
        }
      }
    }
  }
  async function offerStop() {
    if (
      (await confirm({
        title: copy.nonemptyTitle,
        description: copy.nonemptyDetail,
        confirmLabel: folder?.isActive ? copy.deactivate : ar.common.close,
        tone: 'danger',
      })) &&
      folder?.isActive
    )
      change.mutate(deactivate);
  }
  const actions = [
    canEdit && {
      label: folder
        ? folder.parentId === null
          ? copy.editCategory
          : copy.renameGroup
        : copy.editItem,
      run: () => {
        if (folder) setPanel('edit');
        else {
          setPanel(null);
          void navigate(itemUrl(item!.id) + '/edit', {
            state: { catalogEditorFrom: location.pathname },
          });
        }
      },
    },
    addGroup &&
      folderActive && {
        label: copy.addGroupHere,
        run: () => setPanel('group'),
      },
    addItem &&
      folderActive && {
        label: copy.addItemHere,
        run: () => {
          setPanel(null);
          void navigate(nodeUrl(folder?.id ?? item!.nodeId) + '/new', {
            state: { catalogEditorFrom: location.pathname },
          });
        },
      },
    canEdit &&
      parentId !== null && { label: copy.move, run: () => setPanel('move') },
    folder &&
      defaults && { label: copy.defaults, run: () => setPanel('defaults') },
    canEdit &&
      !record.isActive && {
        label: copy.reactivate,
        run: () => change.mutate(reactivate),
      },
    canDelete &&
      record.isActive && { label: copy.deactivate, run: () => void stop() },
    canDelete &&
      folder && { label: ar.common.delete, run: () => void remove() },
  ].filter((action) => Boolean(action));
  if (!actions.length) return null;
  return (
    <>
      <Button
        iconOnly
        variant="ghost"
        aria-label={copy.actionsFor(record.name)}
        onClick={() => {
          change.reset();
          setPanel('menu');
        }}
      >
        <Ellipsis size={21} aria-hidden="true" />
      </Button>
      <Modal
        open={panel === 'menu'}
        title={record.name}
        dismissible={!change.isPending}
        onClose={() => setPanel(null)}
      >
        <div className="grid gap-2">
          <InlineError error={change.error} />
          {actions.map(
            (action) =>
              action && (
                <Button
                  key={action.label}
                  variant="secondary"
                  disabled={change.isPending}
                  onClick={action.run}
                >
                  {action.label}
                </Button>
              ),
          )}
        </div>
      </Modal>
      {panel === 'edit' && folder && canEdit && (
        <FolderForm folder={folder} onClose={() => setPanel(null)} />
      )}
      {panel === 'group' && addGroup && folderActive && (
        <FolderForm
          parentId={folder?.id ?? item!.nodeId}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'move' && parentId !== null && canEdit && (
        <NodePicker
          title={copy.move}
          tree={Boolean(folder)}
          scope={{ categoryId, currentId: parentId, excludeId: folder?.id }}
          onClose={() => setPanel(null)}
          onPick={(path) => {
            const id = path.at(-1)!.id;
            setPanel('menu');
            change.mutate(() =>
              folder
                ? treeApi.move(folder.id, id)
                : catalogApi.move(item!.id, id),
            );
          }}
        />
      )}
      {panel === 'defaults' && folder && defaults && (
        <NodeDefaults folderId={folder.id} onClose={() => setPanel(null)} />
      )}
    </>
  );
}

export function FolderForm({
  folder,
  parentId,
  onClose,
}: {
  folder?: Folder;
  parentId?: number;
  onClose: () => void;
}) {
  const category = (folder?.parentId ?? parentId) === undefined;
  const [invalid, setInvalid] = useState<string[]>([]);
  const [icon, setIcon] = useState(folder?.iconKey ?? 'folder');
  const client = useQueryClient();
  const change = useMutation({
    mutationFn: ({
      name,
      codePrefix,
    }: {
      name: string;
      codePrefix: string;
    }) => {
      const fields = category ? { name, codePrefix, iconKey: icon } : { name };
      if (folder) return treeApi.edit(folder.id, fields);
      if (parentId !== undefined) return treeApi.group(parentId, name);
      return treeApi.category({ name, codePrefix, iconKey: icon });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['master-data'] });
      toast.success(copy.saved);
      onClose();
    },
  });
  function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (change.isPending) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const codePrefix = String(data.get('prefix') ?? '').trim();
    const issues = [];
    if (!name || name.length > 200) issues.push('name');
    if (category && !/^[A-Z]{2,5}$/.test(codePrefix)) issues.push('prefix');
    setInvalid(issues);
    if (!issues.length) change.mutate({ name, codePrefix });
  }
  return (
    <Modal
      open
      title={
        category
          ? folder
            ? copy.editCategory
            : copy.addCategory
          : folder
            ? copy.renameGroup
            : copy.addGroup
      }
      dismissible={!change.isPending}
      onClose={onClose}
    >
      <form className="grid gap-4" noValidate onSubmit={save}>
        <Field
          label={admin.name}
          error={invalid.includes('name') ? admin.validName : undefined}
          required
        >
          {(props) => (
            <Input
              {...props}
              name="name"
              defaultValue={folder?.name}
              data-initial-focus
            />
          )}
        </Field>
        {category && (
          <>
            <Field
              label={copy.prefix}
              error={invalid.includes('prefix') ? copy.validPrefix : undefined}
              required
            >
              {(props) => (
                <Input
                  {...props}
                  name="prefix"
                  dir="ltr"
                  maxLength={5}
                  defaultValue={folder?.codePrefix ?? ''}
                  readOnly={Boolean(folder?.subtreeItemCount)}
                />
              )}
            </Field>
            <Field label={copy.icon}>
              {(props) => (
                <div className="flex items-center gap-2">
                  <CategoryIcon name={icon} />
                  <Select
                    {...props}
                    value={icon}
                    onChange={(event) => setIcon(event.currentTarget.value)}
                  >
                    {categoryIcons.map((key) => (
                      <option key={key} value={key}>
                        {copy.icons[key]}
                      </option>
                    ))}
                    {!categoryIcons.some((key) => key === icon) && (
                      <option value={icon}>{copy.icons.folder}</option>
                    )}
                  </Select>
                </div>
              )}
            </Field>
          </>
        )}
        <InlineError error={change.error} />
        <Button
          type="submit"
          className="justify-self-start"
          loading={change.isPending}
        >
          {ar.common.save}
        </Button>
      </form>
    </Modal>
  );
}

function NodeDefaults({
  folderId,
  onClose,
}: {
  folderId: number;
  onClose: () => void;
}) {
  const [selection, setSelection] = useState<string[]>();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['master-data', 'defaults', folderId],
    queryFn: async ({ signal }) => {
      const [own, attributes] = await Promise.all([
        treeApi.ownAttributes(folderId, signal),
        attributesApi.list(signal),
      ]);
      return { own, attributes };
    },
  });
  const mutation = useMutation({
    mutationFn: (ids: string[]) =>
      treeApi.setAttributes(folderId, ids.map(Number)),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['master-data'] });
      toast.success(copy.saved);
      onClose();
    },
  });
  return (
    <Modal
      open
      title={copy.defaults}
      description={copy.defaultsHint}
      dismissible={!mutation.isPending}
      onClose={onClose}
    >
      <LoadRecord query={query}>
        {({ own, attributes }) => {
          const ownIds = own.map(({ id }) => String(id));
          const value = selection ?? ownIds;
          return (
            <div className="grid gap-3">
              <ChipSelect
                label={copy.attributes}
                value={value}
                onChange={setSelection}
                options={attributes
                  .filter(
                    ({ id, isActive }) =>
                      isActive || ownIds.includes(String(id)),
                  )
                  .map(({ id, name }) => ({ value: String(id), label: name }))}
              />
              <InlineError error={mutation.error} />
              <Button
                className="justify-self-start"
                loading={mutation.isPending}
                onClick={() => mutation.mutate(value)}
              >
                {ar.common.save}
              </Button>
            </div>
          );
        }}
      </LoadRecord>
    </Modal>
  );
}
