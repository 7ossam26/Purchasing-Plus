import { recordQuerySchema, reportQuerySchema } from '@purchasing-plus/shared';
import { z } from 'zod';

export type ReportFilters = z.output<ReturnType<typeof reportQuerySchema>>;
export type RecordFilters = z.output<ReturnType<typeof recordQuerySchema>>;
