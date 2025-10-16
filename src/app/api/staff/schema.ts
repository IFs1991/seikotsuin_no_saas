import { z } from 'zod';
import { Database } from '@/types/supabase';
import { StaffRole } from '@/types/api';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const staffRoles = [
  'manager',
  'practitioner',
  'receptionist',
  'admin',
] as const satisfies ReadonlyArray<StaffRole>;

export const staffQuerySchema = z.object({
  clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
});

export type StaffQueryInput = z.infer<typeof staffQuerySchema>;

export const staffInsertSchema = z
  .object({
    clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
    name: z
      .string()
      .trim()
      .min(1, '名前は必須です')
      .max(255, '名前は255文字以内で入力してください'),
    role: z.enum(staffRoles, {
      errorMap: () => ({ message: 'role の値が不正です' }),
    }),
    email: z.string().email('メールアドレスの形式が正しくありません'),
    hire_date: z
      .string()
      .trim()
      .optional()
      .refine(value => !value || dateRegex.test(value), {
        message: 'hire_date はYYYY-MM-DD形式で入力してください',
      })
      .transform(value => (value && value.length > 0 ? value : undefined)),
    is_therapist: z.boolean().default(false),
  })
  .strict();

export type StaffInsertDTO = z.infer<typeof staffInsertSchema>;

export function mapStaffInsertToRow(
  dto: StaffInsertDTO
): Database['public']['Tables']['staff']['Insert'] {
  return {
    clinic_id: dto.clinic_id,
    name: dto.name,
    role: dto.role,
    email: dto.email,
    password_hash: 'temporary_hash',
    hire_date: dto.hire_date ?? null,
    is_therapist: dto.is_therapist,
  };
}
