import {
  dataEntity,
  emptyInput,
  type DataEntity,
} from '@purchasing-plus/shared';
import { Router, type Request, type RequestHandler } from 'express';

import { endpoint } from '../access/endpoint.js';

import { sendWorkbook, uploadData, type DataFile } from './files.js';
import { exportData, importData, template } from './service.js';

export const data = Router();
const uploads = new WeakMap<Request, { entity: DataEntity; file: DataFile }>();
const upload: RequestHandler = async (req, _res, next) => {
  emptyInput.parse(req.query);
  const entity = dataEntity.parse(req.params.entity);
  uploads.set(req, { entity, file: await uploadData(req, entity) });
  next();
};

data.get(
  '/templates/:entity',
  ...endpoint(
    ['data.import'],
    async ({ req }) => {
      emptyInput.parse(req.query);
      const entity = dataEntity.parse(req.params.entity);
      return {
        filename: `${entity}-template.xlsx`,
        workbook: await template(entity),
      };
    },
    200,
    undefined,
    undefined,
    false,
    ({ filename, workbook }, res) => sendWorkbook(res, filename, workbook),
  ),
);

data.get(
  '/export/:entity',
  ...endpoint(
    ['data.export'],
    async (ctx) => {
      emptyInput.parse(ctx.req.query);
      const entity = dataEntity.parse(ctx.req.params.entity);
      return {
        filename: `${entity}.xlsx`,
        workbook: await exportData(ctx, entity),
      };
    },
    200,
    undefined,
    undefined,
    false,
    ({ filename, workbook }, res) => sendWorkbook(res, filename, workbook),
  ),
);

for (const operation of ['preview', 'commit'] as const) {
  data.post(
    `/import/:entity/${operation}`,
    ...endpoint(
      ['data.import'],
      (ctx) => {
        const { entity, file } = uploads.get(ctx.req)!;
        return importData(ctx, entity, file, operation === 'commit');
      },
      200,
      undefined,
      upload,
    ),
  );
}
