import { createUnit } from '@purchasing-plus/shared';
import { admin, masterData as copy } from '@purchasing-plus/shared/i18n/ar';

import {
  MasterRecords,
  NameField,
  RecordForm,
  recordName,
} from '../../features/catalog/MasterRecords.js';
import { unitsApi } from '../../lib/api/units.js';

export function UnitsPage() {
  return (
    <MasterRecords
      area="units"
      title={copy.units}
      add={copy.addUnit}
      edit={copy.editUnit}
      empty={copy.emptyUnits}
      columns={[recordName]}
      list={unitsApi.list}
      activate={({ id }) => unitsApi.edit(id, { isActive: true })}
      deactivate={({ id }) => unitsApi.deactivate(id)}
      remove={({ id }) => unitsApi.remove(id)}
      form={(props) => (
        <RecordForm<ReturnType<typeof createUnit.parse>>
          {...props}
          read={(fields) => {
            const result = createUnit.safeParse({ name: fields.get('name') });
            return result.success
              ? { data: result.data }
              : { errors: { name: admin.validName } };
          }}
          save={(data) =>
            props.row
              ? unitsApi.edit(props.row.id, data)
              : unitsApi.create(data)
          }
        >
          {(errors) => <NameField row={props.row} error={errors.name} />}
        </RecordForm>
      )}
    />
  );
}
