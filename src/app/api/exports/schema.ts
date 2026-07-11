import { z } from 'zod';

export const CLINIC_EXPORT_RESOURCES = [
  'customers',
  'reservations',
  'daily_reports',
] as const;

export const DEFAULT_CLINIC_EXPORT_LIMIT = 1000;
export const MAX_CLINIC_EXPORT_LIMIT = 5000;

export const clinicExportQuerySchema = z
  .object({
    clinic_id: z.string().uuid('有効なクリニックIDを指定してください'),
    resource: z.enum(CLINIC_EXPORT_RESOURCES),
    limit: z.coerce
      .number()
      .int('limitは整数で指定してください')
      .min(1, 'limitは1以上で指定してください')
      .max(
        MAX_CLINIC_EXPORT_LIMIT,
        `limitは${MAX_CLINIC_EXPORT_LIMIT}以下で指定してください`
      )
      .default(DEFAULT_CLINIC_EXPORT_LIMIT),
  })
  .strict();

export type ClinicExportResource = (typeof CLINIC_EXPORT_RESOURCES)[number];
