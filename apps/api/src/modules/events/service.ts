import type { PrismaClient } from '@prisma/client';
import { ar } from '@purchasing-plus/shared';
import type { Request, Response } from 'express';

import {
  allowed,
  authenticate,
  missing,
  sessionId,
} from '../../middleware/access.js';
import { AppError } from '../../middleware/errors.js';
import type { Context } from '../access/endpoint.js';
import { accessTransaction } from '../access/repo.js';

import type { EventBus, LiveSignal, StreamTickets } from './bus.js';
import {
  latestNotification,
  markRead,
  purgeNotifications,
  replayNotifications,
} from './repo.js';

export async function issueTicket(ctx: Context) {
  await ctx.audit('events.ticket', 'Session', null);
  const { req, now } = ctx;
  const tickets: StreamTickets = req.app.locals.streamTickets;
  return {
    ticket: tickets.issue(
      sessionId(req, req.app.locals.env.SESSION_SECRET),
      +now,
    ),
  };
}

export async function readNotifications(ctx: Context, id?: number) {
  const count = await markRead(ctx.tx, ctx.viewer, ctx.now, id);
  if (count === null) throw missing();
  if (count)
    await ctx.audit(
      id === undefined ? 'notification.readAll' : 'notification.read',
      'Notification',
      id ?? null,
      null,
      { count },
    );
  const bus: EventBus = ctx.req.app.locals.eventBus;
  if (count)
    ctx.onCommit(async () =>
      bus.publish({ type: 'notifications.read', userId: ctx.viewer.userId }),
    );
  return { count };
}

const heartbeatMs = 25_000;

export function openStream(
  req: Request,
  res: Response,
  ticket: string,
  after: number | undefined,
) {
  const { db, env, clock, cache, eventBus, streamTickets } = req.app.locals;
  const bus: EventBus = eventBus;
  const tickets: StreamTickets = streamTickets;
  if (!tickets.consume(ticket, sessionId(req, env.SESSION_SECRET), +clock()))
    throw new AppError(401, 'INVALID_STREAM_TICKET', ar.live.invalidTicket);

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, no-transform',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  let cursor = after;
  let ready = false;
  let active = true;
  let pending = true;
  let draining = false;
  const changes = new Map<number, number>();

  function frame(value: string) {
    if (active && !res.writableEnded && !res.write(value)) res.end();
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (active && pending) {
        pending = false;
        const batch = [...changes];
        changes.clear();
        const { viewer, rows, latest } = await accessTransaction(
          db as PrismaClient,
          false,
          async (tx) => {
            const viewer = await authenticate(
              tx,
              req,
              env.SESSION_SECRET,
              cache,
            );
            const latest =
              cursor === undefined
                ? await latestNotification(tx, viewer)
                : undefined;
            const rows =
              cursor === undefined
                ? []
                : await replayNotifications(tx, viewer, cursor);
            return { viewer, rows, latest };
          },
        );
        if (!ready) {
          ready = true;
          if (latest !== undefined) cursor = latest;
          frame(`id: ${cursor}\nevent: ready\ndata: {}\n\n`);
        }
        for (const row of rows) {
          cursor = row.id;
          const data = JSON.stringify({
            id: row.id,
            requestId: row.requestId,
            type: row.event.type,
          });
          frame(`id: ${row.id}\nevent: notification\ndata: ${data}\n\n`);
        }
        if (rows.length === 100) pending = true;
        if (allowed(viewer, 'requests.view')) {
          for (const [requestId, siteId] of batch) {
            if (
              viewer.isSuperadmin ||
              viewer.siteScope === 'ALL' ||
              viewer.siteIds.includes(siteId)
            )
              frame(
                `event: request.changed\ndata: ${JSON.stringify({ requestId })}\n\n`,
              );
          }
        }
      }
    } catch {
      if (active) res.end();
    } finally {
      draining = false;
    }
  }

  function schedule(signal?: LiveSignal) {
    if (signal && 'userId' in signal && signal.userId !== req.viewer.userId)
      return;
    if (signal?.type === 'notifications.read') {
      frame('event: notifications.read\ndata: {}\n\n');
      return;
    }
    if (signal?.type === 'request.changed')
      changes.set(signal.requestId, signal.siteId);
    pending = true;
    void drain();
  }

  const unsubscribe = bus.subscribe(schedule);
  const heartbeat = setInterval(() => {
    frame(': heartbeat\n\n');
    schedule();
  }, heartbeatMs);
  res.once('close', () => {
    active = false;
    clearInterval(heartbeat);
    unsubscribe();
  });
  schedule();
}

export function startNotificationPurge(db: PrismaClient, clock: () => Date) {
  const run = () => {
    void purgeNotifications(db, clock()).catch(() => {
      console.error('Notification purge failed');
    });
  };
  run();
  return setInterval(run, 86_400_000).unref();
}
