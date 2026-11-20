import {
  createSupplier,
  editSupplier,
  formatEgyptianMobile,
  normalizeEgyptianMobile,
} from '@purchasing-plus/shared';
import { admin, masterData as copy } from '@purchasing-plus/shared/i18n/ar';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useCan } from '../../app/session.js';
import type { TableColumn } from '../../components/shared/data-table.js';
import { LoadRecord } from '../../components/shared/record-feedback.js';
import { ChipSelect, ToggleRow } from '../../components/ui/choice.js';
import { Field, Input, Textarea } from '../../components/ui/field.js';
import { EmptyState } from '../../components/ui/states.js';
import {
  MasterRecords,
  NameField,
  RecordForm,
  recordName,
  type FormProps,
} from '../../features/catalog/MasterRecords.js';
import type { NamedRecord } from '../../lib/api/catalog.js';
import { suppliersApi, type Supplier } from '../../lib/api/suppliers.js';

const columns: TableColumn<Supplier>[] = [
  recordName,
  {
    id: 'contact',
    header: copy.contact,
    cell: (row) => <bdi>{row.contactPerson || copy.dash}</bdi>,
  },
  {
    id: 'phone',
    header: copy.phone,
    cell: (row) => (
      <bdi dir="ltr" className="numeric whitespace-nowrap">
        {row.whatsappDisplay}
      </bdi>
    ),
  },
];
export function SuppliersPage() {
  return (
    <MasterRecords
      area="suppliers"
      title={copy.suppliers}
      add={copy.addSupplier}
      edit={copy.editSupplier}
      empty={copy.emptySuppliers}
      columns={columns}
      list={suppliersApi.list}
      activate={({ id }) => suppliersApi.edit(id, { isActive: true })}
      deactivate={({ id }) => suppliersApi.deactivate(id)}
      remove={({ id }) => suppliersApi.remove(id)}
      form={(props) => <SupplierEditor {...props} />}
    />
  );
}
function SupplierEditor(props: FormProps<Supplier>) {
  const query = useQuery({
    queryKey: ['master-data', 'supplier-categories'],
    queryFn: ({ signal }) => suppliersApi.categories(signal),
  });
  return (
    <LoadRecord query={query}>
      {(categories) =>
        categories.length ? (
          <SupplierForm {...props} categories={categories} />
        ) : (
          <EmptyState
            title={copy.emptyCategories}
            description={copy.chooseCategories}
          />
        )
      }
    </LoadRecord>
  );
}
function SupplierForm({
  row,
  categories,
  ...form
}: FormProps<Supplier> & { categories: NamedRecord[] }) {
  const canDeactivate = useCan('suppliers.delete');
  const [phone, setPhone] = useState(row?.whatsappDisplay ?? '');
  const [selected, setSelected] = useState(row?.categoryIds.map(String) ?? []);
  const [active, setActive] = useState(row?.isActive ?? true);
  const normalized = normalizeEgyptianMobile(phone);
  const options = categories.map(({ id, name }) => ({
    value: String(id),
    label: name,
  }));
  return (
    <RecordForm<ReturnType<typeof editSupplier.parse>>
      {...form}
      row={row}
      read={(fields) => {
        const errors: Record<string, string> = {};
        const base = {
          name: fields.get('name'),
          contactPerson: fields.get('contact'),
          notes: fields.get('notes'),
          whatsappNumber: normalized.ok ? normalized.digits : phone,
          categoryIds: selected.map(Number),
        };
        const result = row
          ? editSupplier.safeParse({
              ...base,
              isActive: active !== row.isActive ? active : undefined,
            })
          : createSupplier.safeParse({
              ...base,
              isActive: active ? undefined : false,
            });
        if (!result.success) {
          for (const { path } of result.error.issues) {
            const field = String(path[0]);
            errors[field] =
              field === 'categoryIds' ? copy.chooseCategories : admin.validName;
          }
        }
        if (!normalized.ok) errors.whatsappNumber = copy.invalidPhone;
        if (!result.success || !normalized.ok) return { errors };
        return { data: result.data };
      }}
      save={(data) =>
        row
          ? suppliersApi.edit(row.id, data)
          : suppliersApi.create(createSupplier.parse(data))
      }
    >
      {(errors) => (
        <>
          <NameField row={row} error={errors.name} />
          <Field label={copy.contact} error={errors.contactPerson}>
            {(props) => (
              <Input
                {...props}
                name="contact"
                defaultValue={row?.contactPerson}
                maxLength={200}
              />
            )}
          </Field>
          <Field
            label={copy.phone}
            required
            error={
              phone && !normalized.ok
                ? copy.invalidPhone
                : normalized.ok
                  ? undefined
                  : errors.whatsappNumber
            }
          >
            {(props) => (
              <Input
                {...props}
                name="phone"
                type="tel"
                dir="ltr"
                className="numeric text-end"
                maxLength={100}
                value={phone}
                onChange={(event) => setPhone(event.currentTarget.value)}
                onBlur={() => {
                  if (normalized.ok)
                    setPhone(formatEgyptianMobile(normalized.digits));
                }}
              />
            )}
          </Field>
          <fieldset>
            <legend className="text-small font-semibold">
              {copy.categories}
            </legend>
            <ChipSelect
              label={copy.categories}
              value={selected}
              options={options}
              onChange={setSelected}
            />
            {errors.categoryIds && !selected.length && (
              <p role="alert" className="text-small text-danger-fg">
                {errors.categoryIds}
              </p>
            )}
          </fieldset>
          <Field label={copy.notes} error={errors.notes}>
            {(props) => (
              <Textarea
                {...props}
                name="notes"
                defaultValue={row?.notes}
                maxLength={2000}
              />
            )}
          </Field>
          {(canDeactivate || row?.isActive === false) && (
            <ToggleRow
              label={admin.active}
              checked={active}
              onChange={setActive}
            />
          )}
        </>
      )}
    </RecordForm>
  );
}
