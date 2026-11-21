import {
  recordDestinations,
  recordQuerySchema,
  reportDestinations,
  reportHubKeys,
  reportItemSearch,
  reportQuerySchema,
  type ReportTable,
} from '@purchasing-plus/shared';
import { Router, type Response } from 'express';

import {
  allowed,
  forbidden,
  requireAnyPermission,
} from '../../middleware/access.js';
import { endpoint, type Context } from '../access/endpoint.js';

import { workbook } from './excel.js';
import { findItems, getOptions, getRecords, getReport } from './service.js';

export const reports = Router();
reports.get(
  '/reports/options',
  ...endpoint(
    [],
    getOptions,
    200,
    undefined,
    requireAnyPermission(reportHubKeys),
  ),
);
reports.get(
  '/reports/price-history/items',
  ...endpoint(['reports.priceHistory', 'requests.viewPrices'], (ctx) =>
    findItems(ctx, reportItemSearch.parse(ctx.req.query)),
  ),
);

function response<T extends { main: ReportTable }>(
  ctx: Context,
  format: 'xlsx' | undefined,
  read: () => Promise<T>,
) {
  if (format && !allowed(ctx.viewer, 'reports.export')) throw forbidden();
  return read();
}

for (const [id, key] of reportDestinations) {
  reports.get(
    '/reports/' + id,
    ...endpoint(
      [key],
      (ctx) => {
        const filters = reportQuerySchema(id).parse(ctx.req.query);
        return response(ctx, filters.format, () => getReport(ctx, id, filters));
      },
      200,
      undefined,
      undefined,
      false,
      sendReport(id),
    ),
  );
}
for (const [id] of recordDestinations) {
  reports.get(
    '/records/' + id,
    ...endpoint(
      ['records.view'],
      (ctx) => {
        const filters = recordQuerySchema(id).parse(ctx.req.query);
        return response(ctx, filters.format, () =>
          getRecords(ctx, id, filters),
        );
      },
      200,
      undefined,
      undefined,
      false,
      sendReport(id),
    ),
  );
}

function sendReport(id: string) {
  return async (result: { main: ReportTable }, res: Response) => {
    if (res.req.query.format === 'xlsx') {
      const file = await workbook(result.main);
      res.attachment(id + '.xlsx').send(file);
    } else {
      res.json(result);
    }
  };
}
