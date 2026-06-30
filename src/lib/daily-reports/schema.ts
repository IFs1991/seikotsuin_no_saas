import { z } from 'zod';

export const DAILY_REPORT_MUTATION_ROLES = [
  'admin',
  'clinic_admin',
  'therapist',
  'staff',
] as const;

function isValidReportDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const dailyReportPayloadSchema = z
  .object({
    id: z
      .string()
      .uuid({ message: 'idはUUID形式で指定してください' })
      .optional(),
    clinic_id: z.string({ required_error: 'clinic_idは必須です' }).uuid({
      message: 'clinic_idはUUID形式で指定してください',
    }),
    staff_id: z
      .string()
      .uuid({ message: 'staff_idはUUID形式で指定してください' })
      .optional()
      .nullable(),
    report_date: z
      .string({ required_error: 'report_dateは必須です' })
      .refine(
        isValidReportDateKey,
        'report_dateはYYYY-MM-DD形式で入力してください'
      ),
    total_patients: z.coerce
      .number({ invalid_type_error: 'total_patientsは数値で入力してください' })
      .int('total_patientsは整数で入力してください')
      .min(0, 'total_patientsは0以上で入力してください'),
    new_patients: z.coerce
      .number({ invalid_type_error: 'new_patientsは数値で入力してください' })
      .int('new_patientsは整数で入力してください')
      .min(0, 'new_patientsは0以上で入力してください'),
    total_revenue: z.coerce
      .number({ invalid_type_error: 'total_revenueは数値で入力してください' })
      .min(0, 'total_revenueは0以上で入力してください'),
    insurance_revenue: z.coerce
      .number({
        invalid_type_error: 'insurance_revenueは数値で入力してください',
      })
      .min(0, 'insurance_revenueは0以上で入力してください'),
    private_revenue: z.coerce
      .number({ invalid_type_error: 'private_revenueは数値で入力してください' })
      .min(0, 'private_revenueは0以上で入力してください'),
    report_text: z
      .string()
      .max(2000, 'report_textは2000文字以内で入力してください')
      .optional()
      .nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.new_patients > data.total_patients) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'new_patientsはtotal_patients以下で入力してください',
        path: ['new_patients'],
      });
    }

    if (data.insurance_revenue + data.private_revenue > data.total_revenue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'total_revenueは保険診療と自費診療の合計以上である必要があります',
        path: ['total_revenue'],
      });
    }
  });

export type DailyReportPayload = z.infer<typeof dailyReportPayloadSchema>;
