import { Router } from 'express';

import { endpoint } from '../access/endpoint.js';

import {
  createAccount,
  updateAccount,
  listAccounts,
  resetAccount,
  userOptions,
} from './service.js';
export function accountRoutes(support: boolean) {
  const router = Router();
  const read = support ? 'system.superadmins' : 'users.view',
    write = support ? 'system.superadmins' : 'users.manage';
  router.get('/', ...endpoint([read], (c) => listAccounts(c, support)));
  if (!support)
    router.get('/options', ...endpoint(['users.view'], userOptions));
  router.post('/', ...endpoint([write], (c) => createAccount(c, support), 201));
  router.patch('/:id', ...endpoint([write], (c) => updateAccount(c, support)));
  router.post(
    '/:id/reset-password',
    ...endpoint([write], (c) => resetAccount(c, support), 204),
  );
  return router;
}
