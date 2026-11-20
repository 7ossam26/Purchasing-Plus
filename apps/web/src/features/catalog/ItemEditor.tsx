import {
  catalogAttributeNumber,
  createCatalogItem,
  editCatalogItemInEditor,
} from '@purchasing-plus/shared';
import {
  admin,
  ar,
  catalogImages as imageCopy,
  masterData as copy,
} from '@purchasing-plus/shared/i18n/ar';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useEffect, useState, type SubmitEvent } from 'react';

import { useCan } from '../../app/session.js';
import {
  InlineError,
  LoadRecord,
} from '../../components/shared/record-feedback.js';
import { useLeaveGuard } from '../../components/shared/use-leave-guard.js';
import { Button } from '../../components/ui/button.js';
import { ToggleRow } from '../../components/ui/choice.js';
import {
  Field,
  Input,
  NumberInput,
  Select,
  Textarea,
} from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { toast } from '../../components/ui/toast.js';
import {
  catalogApi,
  type Attribute,
  type CatalogItem,
  type NamedRecord,
} from '../../lib/api/catalog.js';

import { ImageManager } from './ImageManager.js';
import { NodePicker } from './NodePicker.js';
import { pathLabel } from './presentation.js';

type Choices = Awaited<ReturnType<typeof catalogApi.choices>>;
type Selected = {
  attribute: Attribute;
  value: string | number;
  inherited?: boolean;
};
type EditorProps = {
  item?: CatalogItem;
  nodeId: number;
  onClose: () => void;
  onSaved: (item: CatalogItem) => void;
};

export function ItemEditor(props: EditorProps) {
  const { item, nodeId, onClose } = props;
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const query = useQuery({
    queryKey: ['master-data', 'editor', nodeId],
    queryFn: async ({ signal }) => {
      const choices = await catalogApi.choices(nodeId, signal);
      const path =
        item?.nodePath ??
        (await catalogApi.node(nodeId, true, signal)).breadcrumb;
      return { choices, path };
    },
  });
  return (
    <Modal
      workspace
      open
      title={item ? copy.editItem : copy.addItem}
      dismissible={!busy && !imageBusy}
      onClose={onClose}
    >
      <LoadRecord query={query}>
        {({ choices, path }) => (
          <ItemForm
            {...props}
            choices={choices}
            initialPath={path}
            onBusy={setBusy}
            imageBusy={imageBusy}
            onImageBusy={setImageBusy}
          />
        )}
      </LoadRecord>
    </Modal>
  );
}

function inherited(attributes: Attribute[]): Selected[] {
  return attributes.map((attribute) => ({
    attribute,
    value: '',
    inherited: true,
  }));
}
function initialValues(
  item: CatalogItem | undefined,
  choices: Choices,
): Selected[] {
  if (!item) return inherited(choices.defaults);
  return item.attributeValues.map(({ attribute, option, value }) => ({
    attribute: {
      ...attribute,
      options:
        choices.attributes.find(({ id }) => id === attribute.id)?.options ??
        (option ? [option] : []),
    },
    value,
  }));
}

function ItemForm({
  item,
  choices,
  initialPath,
  imageBusy,
  onImageBusy,
  onBusy,
  onClose,
  onSaved,
}: EditorProps & {
  choices: Choices;
  initialPath: NamedRecord[];
  imageBusy: boolean;
  onImageBusy: (busy: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const canDeactivate = useCan('catalog.delete');
  const [path, setPath] = useState(initialPath);
  const [pick, setPick] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<CatalogItem>();
  const [selectId, setSelectId] = useState('');
  const [values, setValues] = useState(() => initialValues(item, choices));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [active, setActive] = useState(item?.isActive ?? true);
  const client = useQueryClient();
  useLeaveGuard(dirty);
  useEffect(() => {
    if (saved) onSaved(saved);
  }, [onSaved, saved]);
  const change = useMutation({
    mutationFn: (body: ReturnType<typeof createCatalogItem.parse>) => {
      if (!item) return catalogApi.create(body);
      const status = active === item.isActive ? {} : { isActive: active };
      return catalogApi.saveEditor(
        item.id,
        editCatalogItemInEditor.parse({
          ...body,
          isActive: undefined,
          ...status,
        }),
      );
    },
    onSuccess: (record) => {
      client.setQueryData<CatalogItem>(
        ['master-data', 'item', record.id],
        (previous) => ({
          ...previous,
          ...record,
        }),
      );
      setDirty(false);
      setSaved(record);
      toast.success(copy.saved);
      void client.invalidateQueries({ queryKey: ['master-data'] });
    },
  });
  const relocate = useMutation({
    mutationFn: (nextPath: NamedRecord[]) =>
      client.fetchQuery({
        queryKey: ['master-data', 'editor-location', nextPath.at(-1)!.id],
        queryFn: ({ signal }) =>
          catalogApi.choices(nextPath.at(-1)!.id, signal),
      }),
    onSuccess: (updated, nextPath) => {
      setPath(nextPath);
      setValues((old) => {
        const kept = old.filter(
          ({ inherited, value }) => !inherited || value !== '',
        );
        return [
          ...kept,
          ...inherited(updated.defaults).filter(
            ({ attribute }) =>
              !kept.some((row) => row.attribute.id === attribute.id),
          ),
        ];
      });
      setDirty(true);
    },
  });
  function choosePath(newPath: NamedRecord[]) {
    setPick(false);
    if (path.at(-1)?.id === newPath.at(-1)?.id) return;
    if (item) {
      setPath(newPath);
      setDirty(true);
    } else relocate.mutate(newPath);
  }
  function updateValue(id: number, value: string | number) {
    setDirty(true);
    setValues((old) =>
      old.map((row) => (row.attribute.id === id ? { ...row, value } : row)),
    );
  }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (imageBusy || change.isPending || relocate.isPending || saved) return;
    const form = new FormData(event.currentTarget);
    const invalid: Record<string, string> = {};
    const name = String(form.get('name') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const unitId = Number(form.get('unit'));
    if (!name || name.length > 200) invalid.name = admin.validName;
    if (!unitId) invalid.unit = copy.chooseUnit;
    if (description.length > 2000)
      invalid.description = copy.invalidDescription;
    const attributeValues = values.map(({ attribute, value }) => {
      const normalized = typeof value === 'string' ? value.trim() : value;
      const key = String(attribute.id);
      if (
        attribute.type === 'NUMBER' &&
        !catalogAttributeNumber.safeParse(normalized).success
      )
        invalid[key] = copy.invalidNumber;
      else if (attribute.type === 'SELECT' && typeof normalized !== 'number')
        invalid[key] = copy.chooseOption;
      else if (
        !normalized ||
        (typeof normalized === 'string' && normalized.length > 2000)
      )
        invalid[key] = copy.requiredValue;
      return { attributeId: attribute.id, value: normalized };
    });
    const result = createCatalogItem.safeParse({
      name,
      description,
      nodeId: path.at(-1)?.id,
      unitId,
      attributeValues,
      isActive: !item && !active ? false : undefined,
    });
    setErrors(invalid);
    if (Object.keys(invalid).length || !result.success) return;
    onBusy(true);
    try {
      await change.mutateAsync(result.data);
    } catch {
      // The inline error stays with the form for correction.
    } finally {
      onBusy(false);
    }
  }
  const unused = choices.attributes.filter(
    (option) => !values.some(({ attribute }) => attribute.id === option.id),
  );
  const units =
    item && !choices.units.some(({ id }) => id === item.unitId)
      ? [item.unit, ...choices.units]
      : choices.units;

  return (
    <>
      <form
        className="grid gap-5"
        noValidate
        onChange={(event) => {
          if (!(
            event.target instanceof HTMLInputElement &&
            event.target.type === 'file'
          ))
            setDirty(true);
        }}
        onSubmit={(event) => void save(event)}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={admin.name} error={errors.name} required>
            {(props) => (
              <Input
                {...props}
                name="name"
                defaultValue={item?.name}
                maxLength={200}
                data-initial-focus
              />
            )}
          </Field>
          <Field label={copy.code}>
            {(props) => (
              <Input
                {...props}
                dir={item ? 'ltr' : undefined}
                readOnly
                value={item?.code ?? copy.generatedCode}
              />
            )}
          </Field>
          <Field label={copy.unit} error={errors.unit} required>
            {(props) => (
              <Select {...props} name="unit" defaultValue={item?.unitId ?? ''}>
                <option value="">{copy.chooseUnit}</option>
                {units.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-1">
            <span className="text-small font-semibold">{copy.location}</span>
            <Button
              variant="secondary"
              loading={relocate.isPending}
              className="justify-between text-start"
              aria-label={copy.chooseLocation}
              onClick={() => setPick(true)}
            >
              <bdi className="wrap-anywhere">{pathLabel(path)}</bdi>
            </Button>
          </div>
          <div className="sm:col-span-2">
            <Field label={admin.description} error={errors.description}>
              {(props) => (
                <Textarea
                  {...props}
                  name="description"
                  defaultValue={item?.description ?? ''}
                  maxLength={2000}
                />
              )}
            </Field>
          </div>
        </div>
        <section className="grid gap-3 rounded-panel border border-seam p-3 sm:p-4">
          <h3 className="text-subtitle">{copy.attributes}</h3>
          {values.map(({ attribute, value }) => {
            const current = item?.attributeValues.find(
              ({ attributeId }) => attributeId === attribute.id,
            );
            const options = attribute.options.filter(
              ({ id, isActive }) => isActive || id === current?.value,
            );
            if (
              current?.option &&
              !options.some(({ id }) => id === current.option?.id)
            )
              options.push(current.option);
            return (
              <div
                key={attribute.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"
              >
                <Field
                  label={attribute.name}
                  required
                  error={errors[String(attribute.id)]}
                >
                  {(props) => {
                    if (attribute.type === 'SELECT')
                      return (
                        <Select
                          {...props}
                          value={value}
                          disabled={!attribute.isActive}
                          onChange={(event) =>
                            updateValue(
                              attribute.id,
                              Number(event.currentTarget.value) || '',
                            )
                          }
                        >
                          <option value="">{copy.chooseOption}</option>
                          {options.map(({ id, label }) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      );
                    if (attribute.type === 'NUMBER')
                      return (
                        <div className="flex items-center gap-2">
                          <NumberInput
                            {...props}
                            readOnly={!attribute.isActive}
                            value={String(value)}
                            onValueChange={(next) =>
                              updateValue(attribute.id, next)
                            }
                          />
                          {attribute.unitLabel && (
                            <bdi>{attribute.unitLabel}</bdi>
                          )}
                        </div>
                      );
                    return (
                      <Input
                        {...props}
                        readOnly={!attribute.isActive}
                        maxLength={2000}
                        value={String(value)}
                        onChange={(event) =>
                          updateValue(attribute.id, event.currentTarget.value)
                        }
                      />
                    );
                  }}
                </Field>
                <Button
                  iconOnly
                  variant="ghost"
                  className="mt-6"
                  aria-label={ar.common.delete + ' ' + attribute.name}
                  onClick={() => {
                    setDirty(true);
                    setValues((old) =>
                      old.filter((row) => row.attribute.id !== attribute.id),
                    );
                  }}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </Button>
              </div>
            );
          })}
          {unused.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-36 grow">
                <Field label={copy.chooseAttribute}>
                  {(props) => (
                    <Select
                      {...props}
                      value={selectId}
                      onChange={(event) =>
                        setSelectId(event.currentTarget.value)
                      }
                    >
                      <option value="">{ar.common.choose}</option>
                      {unused.map(({ id, name }) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  const attribute = unused.find(
                    ({ id }) => id === Number(selectId),
                  );
                  if (!attribute) return;
                  setValues((old) => [...old, { attribute, value: '' }]);
                  setDirty(true);
                  setSelectId('');
                }}
              >
                {copy.addAttribute}
              </Button>
            </div>
          )}
        </section>
        {canDeactivate || item?.isActive === false ? (
          <ToggleRow
            label={admin.active}
            checked={active}
            onChange={(value) => {
              setActive(value);
              setDirty(true);
            }}
          />
        ) : (
          item && <p className="text-small text-concrete">{admin.active}</p>
        )}
        {item ? (
          <ImageManager
            item={item}
            onBusy={onImageBusy}
            disabled={change.isPending || relocate.isPending}
          />
        ) : (
          <p className="text-small text-concrete">{imageCopy.chooseFirst}</p>
        )}
        <InlineError
          error={change.error ?? relocate.error}
          retry={relocate.error ? () => setPick(true) : undefined}
        />
        <div className="sticky bottom-0 flex gap-2 border-t border-seam bg-paper py-3 sm:static">
          <Button
            type="submit"
            loading={change.isPending}
            disabled={imageBusy || relocate.isPending}
          >
            {item ? admin.saveChanges : ar.common.save}
          </Button>
          <Button
            variant="secondary"
            disabled={imageBusy || change.isPending}
            onClick={onClose}
          >
            {ar.common.cancel}
          </Button>
        </div>
      </form>
      {pick && (
        <NodePicker
          title={copy.chooseLocation}
          scope={item ? { categoryId: item.nodePath[0]!.id } : undefined}
          onClose={() => setPick(false)}
          onPick={choosePath}
        />
      )}
    </>
  );
}
