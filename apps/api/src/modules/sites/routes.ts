import { Router } from 'express';

import { endpoint } from '../access/endpoint.js';

import * as service from './service.js';
export const sites = Router();
sites.get('/', ...endpoint(['sites.view'], service.listSites));
// Engineer choices also need sites.create or sites.edit, checked in the service.
sites.get('/engineers', ...endpoint(['users.manage'], service.engineerOptions));
sites.get(
  '/:id/engineers',
  ...endpoint(['sites.view', 'users.manage'], service.assignedEngineers),
);
sites.post('/', ...endpoint(['sites.create'], service.createSite, 201));
sites.patch('/:id', ...endpoint(['sites.edit'], service.updateSite));
sites.delete('/:id', ...endpoint(['sites.delete'], service.deactivateSite));
