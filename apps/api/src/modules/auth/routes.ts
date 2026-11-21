import * as s from '@purchasing-plus/shared';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import { cookie, cookieOptions, idle } from '../../middleware/access.js';
import { endpoint } from '../access/endpoint.js';

import {
  profile,
  logIn,
  logout,
  changeOwnPassword,
  invalidLogin,
} from './repo.js';
export function authRoutes() {
  const router = Router();
  router.post(
    '/auth/login',
    rateLimit({
      limit: 40,
      windowMs: 15 * 60 * 1000,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'RATE_LIMIT', message: 'محاولات كثيرة، حاول لاحقًا' },
    }),
    async (req, res) => {
      const input = s.login.parse(req.body);
      const token = await logIn(req, input);
      if (!token) throw invalidLogin();
      res
        .cookie(cookie, token, {
          ...cookieOptions(req.app.locals.env),
          maxAge: idle,
        })
        .status(204)
        .end();
    },
  );
  router.post(
    '/auth/logout',
    ...endpoint(
      [],
      async ({ tx, req, viewer, audit }) => {
        s.emptyInput.parse(req.body ?? {});
        await logout(tx, req);
        await audit('logout', 'User', viewer.userId);
        return null;
      },
      204,
      (res) => res.clearCookie(cookie, cookieOptions(res.app.locals.env)),
    ),
  );
  router.post(
    '/me/password',
    ...endpoint(
      [],
      async ({ tx, req, viewer, audit }) => {
        const data = s.changePassword.parse(req.body);
        await changeOwnPassword(
          tx,
          viewer.userId,
          data.currentPassword,
          data.newPassword,
        );
        await audit('user.password.change', 'User', viewer.userId, null, data);
        return null;
      },
      204,
      (res) => res.clearCookie(cookie, cookieOptions(res.app.locals.env)),
    ),
  );
  router.get(
    '/me',
    ...endpoint([], async ({ tx, viewer, req }) => {
      s.emptyInput.parse(req.query);
      return {
        ...(await profile(tx, viewer.userId)),
        isSuperadmin: viewer.isSuperadmin,
        siteScope: viewer.siteScope,
        permissions: [...viewer.permissions],
      };
    }),
  );
  return router;
}
