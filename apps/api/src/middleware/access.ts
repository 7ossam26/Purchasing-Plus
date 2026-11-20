import { createHmac } from 'node:crypto';

import {
  registry,
  isPermissionKey,
  type PermissionKey,
} from '@purchasing-plus/shared/permissions';
import type { Request, RequestHandler, Response } from 'express';

import type { AppEnv } from '../config/env.js';
import {
  accessTransaction,
  findSession,
  storedKeys,
  touchSession,
  type Tx,
} from '../modules/access/repo.js';

import { AppError } from './errors.js';
export interface Viewer {
  userId: number;
  isSuperadmin: boolean;
  permissions: Set<PermissionKey>;
  siteScope: 'ASSIGNED' | 'ALL';
  siteIds: number[];
}

export const forbidden = (
  message = 'ليست لديك الصلاحية المطلوبة',
  fix?: string,
) => new AppError(403, 'FORBIDDEN', message, fix);
export const missing = () => new AppError(404, 'NOT_FOUND', 'السجل غير موجود');
export function assertSiteInScope(v: Viewer, id: number) {
  if (!v.isSuperadmin && v.siteScope === 'ASSIGNED' && !v.siteIds.includes(id))
    throw missing();
}
export function siteWhere(v: Viewer) {
  return v.isSuperadmin || v.siteScope === 'ALL'
    ? {}
    : { siteId: { in: v.siteIds } };
}
export function allowed(v: Viewer, key: PermissionKey) {
  return (
    v.isSuperadmin ||
    (!registry.find((p) => p.key === key)?.superadminOnly &&
      v.permissions.has(key))
  );
}
export function requirePermission(...keys: PermissionKey[]): RequestHandler {
  return (r, _s, n) =>
    keys.every((k) => allowed(r.viewer, k)) ? n() : n(forbidden());
}
export function requireAnyPermission(
  keys: readonly PermissionKey[],
): RequestHandler {
  return (r, _s, n) =>
    keys.some((k) => allowed(r.viewer, k)) ? n() : n(forbidden());
}
export function originCheck(origin: string): RequestHandler {
  return (r, _s, n) =>
    ['GET', 'HEAD', 'OPTIONS'].includes(r.method) ||
    r.get('Origin') === new URL(origin).origin
      ? n()
      : n(forbidden('مصدر الطلب غير مسموح'));
}
export const idle = 7 * 24 * 3600 * 1000;
export const cookie = 'purchasing_session';
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: !['development', 'test'].includes(process.env.NODE_ENV ?? ''),
    sameSite: 'lax' as const,
    path: '/',
  };
}
export function digest(secret: string, token: string) {
  return createHmac('sha256', secret).update(token).digest('hex');
}
function cookieToken(req: Request) {
  const token = req.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookie + '='))
    ?.slice(cookie.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : '';
}
export function sessionId(req: Request, secret: string) {
  const token = cookieToken(req);
  return token ? digest(secret, token) : '';
}
const unauthorized = () =>
  new AppError(401, 'SESSION_REQUIRED', 'يرجى تسجيل الدخول');
type Cached = { stamp: string; until: number; keys: PermissionKey[] };
export type Cache = Map<number, Cached>;
export async function authenticate(
  tx: Tx,
  req: Request,
  secret: string,
  cache: Cache,
) {
  const id = sessionId(req, secret);
  if (!id) throw unauthorized();
  const session = await findSession(tx, id);
  if (
    !session ||
    !session.user.isActive ||
    session.expiresAt.getTime() <= Date.now()
  )
    throw unauthorized();
  const u = session.user,
    stamp = [
      u.updatedAt.getTime(),
      u.role?.id,
      u.role?.updatedAt.getTime(),
      u.isSuperadmin,
    ].join('/');
  let hit = cache.get(u.id);
  if (!hit || hit.stamp !== stamp || hit.until <= Date.now()) {
    const rows = u.role ? await storedKeys(tx, u.role.id) : [];
    const keys = u.isSuperadmin
      ? registry.map((p) => p.key)
      : rows.flatMap(({ key }) => {
          if (!isPermissionKey(key)) {
            console.warn('Unknown stored permission', key);
            return [];
          }
          return registry.find((p) => p.key === key)?.superadminOnly
            ? []
            : [key];
        });
    hit = { stamp, until: Date.now() + 30000, keys };
    if (cache.size >= 10000) cache.clear();
    cache.set(u.id, hit);
  }
  return {
    userId: u.id,
    isSuperadmin: u.isSuperadmin,
    siteScope: u.isSuperadmin ? ('ALL' as const) : u.role!.siteScope,
    permissions: new Set(hit.keys),
    siteIds: u.sites.map((s) => s.siteId),
  };
}
export function requireSession(
  req: Request,
  res: Response,
  next: Parameters<RequestHandler>[2],
) {
  const env: AppEnv = req.app.locals.env;
  const id = sessionId(req, env.SESSION_SECRET);
  void accessTransaction(req.app.locals.db, false, async (tx) => {
    const viewer = await authenticate(
      tx,
      req,
      env.SESSION_SECRET,
      req.app.locals.cache,
    );
    await touchSession(tx, id, new Date(Date.now() + idle));
    return viewer;
  }).then((v) => {
    req.viewer = v;
    res.cookie(cookie, cookieToken(req), { ...cookieOptions(), maxAge: idle });
    res.setHeader('Cache-Control', 'no-store');
    next();
  }, next);
}
