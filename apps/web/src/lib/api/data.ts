import type { DataEntity, DataPreview } from '@purchasing-plus/shared';

import { api, download } from './client.js';

const excel =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function upload(
  operation: 'preview' | 'commit',
  entity: DataEntity,
  file: File,
) {
  const body = new FormData();
  body.append('file', file);
  return api<DataPreview>(`/data/import/${entity}/${operation}`, {
    method: 'POST',
    body,
  });
}

export const dataApi = {
  template: (entity: DataEntity) =>
    download(`/data/templates/${entity}`, excel),
  export: (entity: DataEntity) => download(`/data/export/${entity}`, excel),
  preview: (entity: DataEntity, file: File) => upload('preview', entity, file),
  commit: (entity: DataEntity, file: File) => upload('commit', entity, file),
};
