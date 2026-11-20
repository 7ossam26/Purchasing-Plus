import { createAttribute, editAttribute } from '@purchasing-plus/shared';
import { catalogImages as imageCopy } from '@purchasing-plus/shared/i18n/ar';
import { admin, ar, masterData as copy } from '@purchasing-plus/shared/i18n/ar';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { TableColumn } from '../../components/shared/data-table.js';
import {
  InlineError,
  LoadRecord,
} from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { useConfirm, usePrompt } from '../../components/ui/dialogs.js';
import { Field, Input, Select } from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { EmptyState } from '../../components/ui/states.js';
import { toast } from '../../components/ui/toast.js';
import {
  MasterRecords,
  NameField,
  RecordForm,
  recordName,
  type FormProps,
} from '../../features/catalog/MasterRecords.js';
import { Stopped } from '../../features/catalog/presentation.js';
import { attributesApi } from '../../lib/api/attributes.js';
import type { Attribute } from '../../lib/api/catalog.js';

const types = ['TEXT', 'NUMBER', 'SELECT'] as const;
const columns: TableColumn<Attribute>[] = [
  recordName,
  { id: 'type', header: copy.type, cell: (row) => copy.types[row.type] },
  {
    id: 'unit',
    header: copy.unitLabel,
    cell: (row) => row.unitLabel ?? copy.dash,
  },
];
export function AttributesPage() {
  const [options, setOptions] = useState<Attribute>();
  return (
    <>
      <MasterRecords
        area="attributes"
        title={copy.attributes}
        add={copy.addAttribute}
        edit={copy.editAttribute}
        empty={copy.emptyAttributes}
        columns={columns}
        list={attributesApi.list}
        activate={({ id }) => attributesApi.edit(id, { isActive: true })}
        deactivate={({ id }) => attributesApi.deactivate(id)}
        remove={({ id }) => attributesApi.remove(id)}
        form={(props) => <AttributeForm {...props} />}
        extraActions={(row) =>
          row.type === 'SELECT' && (
            <Button variant="secondary" onClick={() => setOptions(row)}>
              {copy.options}
            </Button>
          )
        }
      />
      {options && (
        <OptionsEditor
          attribute={options}
          onClose={() => setOptions(undefined)}
        />
      )}
    </>
  );
}
function AttributeForm({ row, ...props }: FormProps<Attribute>) {
  const [type, setType] = useState<Attribute['type']>(row?.type ?? 'TEXT');
  const [options, setOptions] = useState<{ key: number; value: string }[]>([]);
  const [nextKey, setNextKey] = useState(0);
  const [unit, setUnit] = useState(row?.unitLabel ?? '');
  return (
    <RecordForm<ReturnType<typeof editAttribute.parse>>
      {...props}
      row={row}
      read={(fields) => {
        const name = fields.get('name');
        const base = {
          name,
          type,
          clientVisible: fields.get('clientVisible') === 'on',
          ...(type === 'NUMBER' ? { unitLabel: unit.trim() || null } : {}),
        };
        const result = row
          ? editAttribute.safeParse(base)
          : createAttribute.safeParse({
              ...base,
              ...(type === 'SELECT'
                ? { options: options.map(({ value }) => value) }
                : {}),
            });
        if (result.success) return { data: result.data };
        return {
          errors: Object.fromEntries(
            result.error.issues.map(({ path }) => [
              String(path[0]),
              path[0] === 'options' ? copy.invalidOptions : admin.validName,
            ]),
          ),
        };
      }}
      save={(data) =>
        row
          ? attributesApi.edit(row.id, data)
          : attributesApi.create(createAttribute.parse(data))
      }
    >
      {(errors) => (
        <>
          <NameField row={row} error={errors.name} />
          <label className="flex min-h-11 items-center gap-3 rounded-control border border-seam p-3">
            <input
              type="checkbox"
              name="clientVisible"
              defaultChecked={row?.clientVisible}
              className="size-5 accent-ppr"
            />
            <span>
              {imageCopy.clientVisible}
              <small className="block text-concrete">
                {imageCopy.clientHint}
              </small>
            </span>
          </label>
          <Field label={copy.type} required>
            {(props) => (
              <Select
                {...props}
                value={type}
                onChange={(event) =>
                  setType(event.currentTarget.value as Attribute['type'])
                }
              >
                {types.map((value) => (
                  <option key={value} value={value}>
                    {copy.types[value]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {type === 'NUMBER' && (
            <Field label={copy.unitLabel} error={errors.unitLabel}>
              {(props) => (
                <Input
                  {...props}
                  value={unit}
                  onChange={(event) => setUnit(event.currentTarget.value)}
                  maxLength={200}
                />
              )}
            </Field>
          )}
          {type === 'SELECT' && !row && (
            <fieldset className="grid gap-2">
              <legend className="text-small font-semibold">
                {copy.options}
              </legend>
              {options.map(({ key, value }) => (
                <div
                  key={key}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1"
                >
                  <Field label={copy.option} required>
                    {(props) => (
                      <Input
                        {...props}
                        value={value}
                        maxLength={200}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setOptions((old) =>
                            old.map((option) =>
                              option.key === key ? { key, value } : option,
                            ),
                          );
                        }}
                      />
                    )}
                  </Field>
                  <Button
                    iconOnly
                    variant="ghost"
                    aria-label={ar.common.delete + ' ' + copy.option}
                    onClick={() =>
                      setOptions((old) =>
                        old.filter((option) => option.key !== key),
                      )
                    }
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </Button>
                </div>
              ))}
              {errors.options && (
                <p role="alert" className="text-small text-danger-fg">
                  {errors.options}
                </p>
              )}
              <Button
                variant="secondary"
                className="justify-self-start"
                onClick={() => {
                  setOptions([...options, { key: nextKey, value: '' }]);
                  setNextKey(nextKey + 1);
                }}
              >
                {copy.addOption}
              </Button>
            </fieldset>
          )}
        </>
      )}
    </RecordForm>
  );
}

function OptionsEditor({
  attribute,
  onClose,
}: {
  attribute: Attribute;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const id = attribute.id;
  const query = useQuery({
    queryKey: ['master-data', 'attribute-options', id],
    queryFn: ({ signal }) => attributesApi.get(id, signal),
  });
  const change = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      toast.success(copy.saved);
      await client.invalidateQueries({ queryKey: ['master-data'] });
    },
  });
  async function labelOption(option?: Attribute['options'][number]) {
    const label = await prompt({
      title: option ? copy.editOption : copy.addOption,
      label: copy.option,
      initialValue: option?.label,
      confirmLabel: ar.common.save,
    });
    if (label?.trim())
      change.mutate(() =>
        option
          ? attributesApi.editOption(id, option.id, { label })
          : attributesApi.addOption(id, label),
      );
  }
  function reorder(options: Attribute['options'], from: number, to: number) {
    const ids = options.map(({ id }) => id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    change.mutate(() => attributesApi.reorderOptions(id, ids));
  }
  async function remove(optionId: number) {
    if (
      await confirm({
        title: copy.deleteTitle,
        description: copy.deleteDetail,
        confirmLabel: ar.common.delete,
        tone: 'danger',
      })
    )
      change.mutate(() => attributesApi.removeOption(id, optionId));
  }
  return (
    <Modal
      open
      title={copy.options + ' — ' + attribute.name}
      dismissible={!change.isPending}
      onClose={onClose}
    >
      <LoadRecord query={query}>
        {({ options }) => (
          <div className="grid gap-3">
            {!options.length && <EmptyState title={copy.emptyOptions} />}
            <ul className="divide-y divide-seam">
              {options.map((option, index) => (
                <li key={option.id} className="grid gap-1 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <bdi className="wrap-anywhere font-semibold">
                      {option.label}
                    </bdi>
                    <Stopped active={option.isActive} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="secondary"
                      disabled={change.isPending}
                      onClick={() => void labelOption(option)}
                    >
                      {admin.edit}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={change.isPending}
                      onClick={() =>
                        change.mutate(() =>
                          option.isActive
                            ? attributesApi.deactivateOption(id, option.id)
                            : attributesApi.editOption(id, option.id, {
                                isActive: true,
                              }),
                        )
                      }
                    >
                      {option.isActive ? copy.deactivate : copy.reactivate}
                    </Button>
                    <Button
                      variant="danger-outline"
                      disabled={change.isPending}
                      onClick={() => void remove(option.id)}
                    >
                      {ar.common.delete}
                    </Button>
                    {index > 0 && (
                      <Button
                        variant="ghost"
                        disabled={change.isPending}
                        onClick={() => reorder(options, index, index - 1)}
                      >
                        {copy.moveUp}
                      </Button>
                    )}
                    {index < options.length - 1 && (
                      <Button
                        variant="ghost"
                        disabled={change.isPending}
                        onClick={() => reorder(options, index, index + 1)}
                      >
                        {copy.moveDown}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <InlineError error={change.error} />
            <Button
              className="justify-self-start"
              loading={change.isPending}
              onClick={() => void labelOption()}
            >
              {copy.addOption}
            </Button>
          </div>
        )}
      </LoadRecord>
    </Modal>
  );
}
