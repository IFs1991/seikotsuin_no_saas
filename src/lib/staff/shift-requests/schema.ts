import { z } from 'zod';
import {
  SHIFT_REQUEST_PERIOD_STATUSES,
  SHIFT_REQUEST_STATUSES,
  SHIFT_REQUEST_TYPES,
} from './types';

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

export const shiftRequestPeriodQuerySchema = z.object({
  clinic_id: z.string().uuid(),
  from: z.string().regex(dateOnlyPattern).optional(),
  to: z.string().regex(dateOnlyPattern).optional(),
  status: z.enum(SHIFT_REQUEST_PERIOD_STATUSES).optional(),
});

export const shiftRequestPeriodCreateSchema = z
  .object({
    clinic_id: z.string().uuid(),
    title: z.string().min(1).max(120),
    period_start: z.string().regex(dateOnlyPattern),
    period_end: z.string().regex(dateOnlyPattern),
    submission_deadline: z.string().datetime(),
    status: z.enum(SHIFT_REQUEST_PERIOD_STATUSES).optional(),
  })
  .refine(
    data =>
      new Date(`${data.period_end}T00:00:00.000Z`).getTime() >=
      new Date(`${data.period_start}T00:00:00.000Z`).getTime(),
    {
      message: 'period_end は period_start 以降にしてください',
      path: ['period_end'],
    }
  );

export const shiftRequestPeriodPatchSchema = z
  .object({
    clinic_id: z.string().uuid(),
    title: z.string().min(1).max(120).optional(),
    period_start: z.string().regex(dateOnlyPattern).optional(),
    period_end: z.string().regex(dateOnlyPattern).optional(),
    submission_deadline: z.string().datetime().optional(),
    status: z.enum(SHIFT_REQUEST_PERIOD_STATUSES).optional(),
  })
  .refine(
    data =>
      data.title !== undefined ||
      data.period_start !== undefined ||
      data.period_end !== undefined ||
      data.submission_deadline !== undefined ||
      data.status !== undefined,
    { message: '更新対象が指定されていません' }
  );

export const shiftRequestQuerySchema = z.object({
  clinic_id: z.string().uuid(),
  period_id: z.string().uuid(),
  staff_id: z.string().uuid().optional(),
  status: z.enum(SHIFT_REQUEST_STATUSES).optional(),
  request_type: z.enum(SHIFT_REQUEST_TYPES).optional(),
});

const shiftRequestTimeRangeFields = {
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
} as const;

function hasValidTimeRange(data: { start_time: string; end_time: string }) {
  return (
    new Date(data.end_time).getTime() > new Date(data.start_time).getTime()
  );
}

export const shiftRequestCreateSchema = z
  .object({
    ...shiftRequestTimeRangeFields,
    clinic_id: z.string().uuid(),
    period_id: z.string().uuid(),
    staff_id: z.string().uuid().optional(),
    request_type: z.enum(SHIFT_REQUEST_TYPES),
    priority: z.number().int().min(1).max(5).default(3),
    status: z.enum(['draft', 'submitted']).default('submitted'),
    note: z.string().max(2000).optional(),
  })
  .refine(hasValidTimeRange, {
    message: 'end_time は start_time より後にしてください',
    path: ['end_time'],
  });

export const shiftRequestPatchSchema = z
  .object({
    start_time: shiftRequestTimeRangeFields.start_time.optional(),
    end_time: shiftRequestTimeRangeFields.end_time.optional(),
    clinic_id: z.string().uuid(),
    request_type: z.enum(SHIFT_REQUEST_TYPES).optional(),
    priority: z.number().int().min(1).max(5).optional(),
    status: z
      .enum(['draft', 'submitted', 'approved', 'rejected', 'withdrawn'])
      .optional(),
    note: z.string().max(2000).nullable().optional(),
    rejection_reason: z.string().max(2000).optional(),
  })
  .refine(
    data =>
      !data.start_time || !data.end_time
        ? true
        : hasValidTimeRange({
            start_time: data.start_time,
            end_time: data.end_time,
          }),
    {
      message: 'end_time は start_time より後にしてください',
      path: ['end_time'],
    }
  )
  .refine(
    data =>
      data.request_type !== undefined ||
      data.priority !== undefined ||
      data.status !== undefined ||
      data.note !== undefined ||
      data.rejection_reason !== undefined ||
      data.start_time !== undefined ||
      data.end_time !== undefined,
    { message: '更新対象が指定されていません' }
  );

export const shiftRequestConvertSchema = z.object({
  clinic_id: z.string().uuid(),
  period_id: z.string().uuid(),
  request_ids: z.array(z.string().uuid()).optional(),
  mode: z.enum(['selected', 'all_approved']),
});
