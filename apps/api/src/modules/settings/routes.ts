import { settingsSchema } from '@purchasing-plus/shared';
import { Router } from 'express';

import { AppError } from '../../middleware/errors.js';
import { endpoint, type Context } from '../access/endpoint.js';

import { readSettings } from './repo.js';
import { updateSettings } from './service.js';

async function update(context: Context) {
  const result = settingsSchema.safeParse(context.req.body);
  if (!result.success) {
    const field = result.error.issues[0]?.path[0];
    const fix =
      field === 'agingDays'
        ? 'اكتب عدد أيام صحيح من 1 إلى 60.'
        : 'راجع نص الرسالة واستخدم المتغيرات الموضّحة فقط.';
    throw new AppError(422, 'INVALID_SETTINGS', 'إعدادات غير صالحة', fix);
  }
  return updateSettings(context, result.data);
}

export const settings = Router();
settings.get('/', ...endpoint([], ({ tx }) => readSettings(tx)));
settings.put('/', ...endpoint(['settings.manage'], update));
