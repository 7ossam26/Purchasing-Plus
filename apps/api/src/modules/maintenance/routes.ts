import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  maintenanceAction,
  maintenanceConfirmation,
} from '@purchasing-plus/shared';
import { Router } from 'express';

import { endpoint } from '../access/endpoint.js';

import { auditProgress, runMaintenance } from './service.js';

export const maintenanceRoutes = Router();
maintenanceRoutes.post(
  '/:action',
  ...endpoint(
    ['system.maintenance'],
    (ctx) =>
      runMaintenance(
        ctx,
        maintenanceAction.parse(ctx.req.params.action),
        maintenanceConfirmation.parse(ctx.req.body),
      ),
    200,
    undefined,
    undefined,
    false,
    async ({ snapshot, result }, res) => {
      if (!snapshot) {
        res.json(result);
        return;
      }
      res.set({
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
      const { db, env } = res.app.locals;
      const progress = Readable.from(
        auditProgress(db, snapshot, env.AUDIT_HMAC_SECRET),
      );
      try {
        await pipeline(
          progress.map((frame) => JSON.stringify(frame) + '\n'),
          res,
        );
      } catch (error) {
        if (!(
          error instanceof Error &&
          'code' in error &&
          error.code === 'ERR_STREAM_PREMATURE_CLOSE'
        ))
          console.error('Audit verification stream failed');
      }
    },
  ),
);
