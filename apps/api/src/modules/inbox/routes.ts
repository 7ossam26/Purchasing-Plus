import { Router } from 'express';

import { endpoint } from '../access/endpoint.js';

import { getInbox } from './service.js';

export const inbox = Router();
inbox.get('/inbox', ...endpoint([], getInbox));
