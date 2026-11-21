import {
  emptyInput,
  eventStreamInput,
  lastEventIdInput,
  notificationsInput,
  pathId,
} from '@purchasing-plus/shared';
import { Router } from 'express';

import { requirePermission, requireSession } from '../../middleware/access.js';
import { endpoint } from '../access/endpoint.js';

import { listNotifications } from './repo.js';
import { issueTicket, openStream, readNotifications } from './service.js';

export const events = Router();
events.post(
  '/events/ticket',
  ...endpoint(
    [],
    async (ctx) => {
      emptyInput.parse(ctx.req.body ?? {});
      return issueTicket(ctx);
    },
    201,
    undefined,
    undefined,
    true,
  ),
);
events.get(
  '/events/stream',
  requireSession,
  requirePermission(),
  (req, res) => {
    const { ticket, after } = eventStreamInput.parse(req.query);
    openStream(
      req,
      res,
      ticket,
      lastEventIdInput.parse(req.get('Last-Event-ID')) ?? after,
    );
  },
);
events.get(
  '/notifications',
  ...endpoint(['requests.view'], (ctx) =>
    listNotifications(
      ctx.tx,
      ctx.viewer,
      notificationsInput.parse(ctx.req.query).page,
    ),
  ),
);
events.post(
  '/notifications/read-all',
  ...endpoint(
    ['requests.view'],
    (ctx) => {
      emptyInput.parse(ctx.req.body ?? {});
      return readNotifications(ctx);
    },
    200,
    undefined,
    undefined,
    true,
  ),
);
events.post(
  '/notifications/:id/read',
  ...endpoint(
    ['requests.view'],
    (ctx) => {
      emptyInput.parse(ctx.req.body ?? {});
      return readNotifications(ctx, pathId.parse(ctx.req.params.id));
    },
    200,
    undefined,
    undefined,
    true,
  ),
);
