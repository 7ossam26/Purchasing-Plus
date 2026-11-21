import { dataEntity, type DataEntity } from '@purchasing-plus/shared';
import { dataUi as copy } from '@purchasing-plus/shared/i18n/ar';
import { useState } from 'react';

import { useCan } from '../../app/session.js';
import { Tabs } from '../../components/ui/tabs.js';
import { DataTransfer } from '../../features/admin/data-transfer.js';

export function DataPage() {
  const [entity, setEntity] = useState<DataEntity>('units');
  const canImport = useCan('data.import');
  const canExport = useCan('data.export');
  return (
    <div className="grid min-w-0 gap-5">
      <h1 className="text-title sm:text-title-wide">{copy.title}</h1>
      {canImport && (
        <section className="grid gap-2">
          <h2 className="text-section">{copy.how}</h2>
          <ol className="numeric grid list-decimal gap-1 ps-5 text-small text-concrete">
            {copy.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      )}
      <Tabs
        label={copy.title}
        value={entity}
        onChange={(value) => setEntity(dataEntity.parse(value))}
        tabs={dataEntity.options.map((id) => ({
          id,
          label: copy.entities[id],
          content: (
            <DataTransfer
              entity={id}
              canImport={canImport}
              canExport={canExport}
            />
          ),
        }))}
      />
    </div>
  );
}
