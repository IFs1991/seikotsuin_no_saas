import { z } from 'zod';
import { Database } from '@/types/supabase';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const genderEnum = z.enum(['male', 'female', 'other']);
const analysisEnum = z.enum(['conversion', 'ltv', 'churn', 'segment']);

const optionalTrimmedString = (max: number) =>
  z
    .string({ required_error: '必須項目です' })
    .trim()
    .max(max, `最大${max}文字までです`)
    .optional()
    .transform(value => {
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    });

export const patientQuerySchema = z.object({
  clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
  analysis: analysisEnum.optional(),
});

export type PatientQueryInput = z.infer<typeof patientQuerySchema>;

export const patientInsertSchema = z
  .object({
    clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
    name: z
      .string()
      .trim()
      .min(1, '名前は必須です')
      .max(255, '名前は255文字以内で入力してください'),
    gender: genderEnum.optional(),
    date_of_birth: z
      .string()
      .trim()
      .optional()
      .refine(value => !value || dateRegex.test(value), {
        message: 'date_of_birth はYYYY-MM-DD形式で入力してください',
      })
      .transform(value => (value && value.length > 0 ? value : undefined)),
    phone_number: optionalTrimmedString(32),
    address: optionalTrimmedString(255),
  })
  .strict();

export type PatientInsertDTO = z.infer<typeof patientInsertSchema>;

export function mapPatientInsertToRow(
  dto: PatientInsertDTO
): Database['public']['Tables']['patients']['Insert'] {
  return {
    clinic_id: dto.clinic_id,
    name: dto.name,
    gender: dto.gender ?? null,
    date_of_birth: dto.date_of_birth ?? null,
    phone_number: dto.phone_number ?? null,
    address: dto.address ?? null,
  };
}
