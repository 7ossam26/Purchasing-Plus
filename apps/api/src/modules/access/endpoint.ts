import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import type { Request, RequestHandler, Response } from 'express';

import {
  allowed,
  authenticate,
  forbidden,
  requirePermission,
  requireSession,
  type Viewer,
} from '../../middleware/access.js';

import { writeAudit } from './audit.js';
import { accessTransaction, actorById, type Tx } from './repo.js';
export type Context = {
  tx: Tx;
  req: Request;
  viewer: Viewer;
  audit: (
    action: string,
    entity: string,
    id: number | null,
    oldValue?: unknown,
    newValue?: unknown,
  ) => Promise<unknown>;
};
export function endpoint(
  keys: PermissionKey[],
  handler: (ctx: Context) => Promise<unknown>,
  status = 200,
  afterCommit?: (response: Response) => void,
): RequestHandler[] {
  return [
    requireSession,
    requirePermission(...keys),
    async (req, res) => {
      const write = !['HEAD', 'GET'].includes(req.method);
      const result = await accessTransaction(
        req.app.locals.db,
        write,
        async (tx) => {
          const env = req.app.locals.env;
          const viewer = await authenticate(
            tx,
            req,
            env.SESSION_SECRET,
            req.app.locals.cache,
          );
          if (!keys.every((k) => allowed(viewer, k))) throw forbidden();
          const actor = await actorById(tx, viewer.userId);
          return handler({
            tx,
            req,
            viewer,
            audit: (action, entity, id, oldValue, newValue) =>
              writeAudit(
                tx,
                env.AUDIT_HMAC_SECRET,
                req.ip ?? null,
                actor,
                action,
                entity,
                id,
                oldValue,
                newValue,
              ),
          });
        },
      );
      afterCommit?.(res);
      res.status(status).json(result);
    },
  ];
}
