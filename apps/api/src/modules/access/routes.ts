import * as s from '@purchasing-plus/shared';
import { Router } from 'express';

import { authRoutes } from '../auth/routes.js';
import { maintenanceRoutes } from '../maintenance/routes.js';
import { roles } from '../roles/routes.js';
import { sites } from '../sites/routes.js';
import { accountRoutes } from '../users/routes.js';

import { endpoint } from './endpoint.js';
import { listAudit, verifyAuditPage } from './repo.js';
export function accessRoutes() {
  const router = Router();
  router.use(authRoutes());
  router.use('/users', accountRoutes(false));
  router.use('/system/superadmins', accountRoutes(true));
  router.use('/system/maintenance', maintenanceRoutes);
  router.use('/roles', roles);
  router.use('/sites', sites);
  router.get(
    '/system/audit-log',
    ...endpoint(['system.auditLog'], async ({ tx, req }) => {
      const { page, pageSize, from, to, userId, entity, action } =
        s.auditFilters.parse(req.query);
      const where = {
        actorId: userId,
        entity,
        action,
        createdAt: { gte: from, lte: to },
      };
      return listAudit(
        tx,
        where,
        page,
        pageSize,
        req.app.locals.env.AUDIT_HMAC_SECRET,
      );
    }),
  );
  router.get(
    '/system/audit-log/verify',
    ...endpoint(['system.auditLog'], async ({ tx, req }) =>
      verifyAuditPage(
        tx,
        s.auditPageIds.parse(req.query).ids,
        req.app.locals.env.AUDIT_HMAC_SECRET,
      ),
    ),
  );
  return router;
}
