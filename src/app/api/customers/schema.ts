import { z } from 'zod';
import type { Database } from '@/types/supabase';

/**
 * 検索クエリ用スキーマ
 * - 最大100文字
 * - 前後の空白をトリム
 * - 空白のみの場合はundefinedに変換
 */
export const searchQuerySchema = z
  .string()
  .max(100, '検索クエリは100文字以内で入力してください')
  .transform(value => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  })
  .optional();

const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform(value => {
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    });

const optionalCustomAttributes = z.record(z.unknown()).optional();

export const customersQuerySchema = z.object({
  clinic_id: z.string().uuid('有効なクリニックIDを指定してください'),
  q: searchQuerySchema,
  id: z.string().uuid('有効な顧客IDを指定してください').optional(),
});

export const customerInsertSchema = z
  .object({
    clinic_id: z.string().uuid(),
    name: z.string().trim().min(1).max(255),
    phone: z.string().trim().min(1).max(32),
    email: optionalTrimmedString(255),
    notes: optionalTrimmedString(2000),
    customAttributes: optionalCustomAttributes,
  })
  .strict();
export type CustomerInsertDTO = z.infer<typeof customerInsertSchema>;

export const customerUpdateSchema = z
  .object({
    clinic_id: z.string().uuid(),
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(255).optional(),
    phone: z.string().trim().min(1).max(32).optional(),
    email: optionalTrimmedString(255),
    notes: optionalTrimmedString(2000),
    customAttributes: optionalCustomAttributes,
  })
  .strict();
export type CustomerUpdateDTO = z.infer<typeof customerUpdateSchema>;

export function mapCustomerInsertToRow(
  dto: CustomerInsertDTO,
  userId: string
): Database['public']['Tables']['customers']['Insert'] {
  return {
    clinic_id: dto.clinic_id,
    name: dto.name,
    phone: dto.phone,
    email: dto.email ?? null,
    notes: dto.notes ?? null,
    custom_attributes: dto.customAttributes ?? null,
    created_by: userId,
  } as any;
}

export function mapCustomerUpdateToRow(
  dto: CustomerUpdateDTO
): Database['public']['Tables']['customers']['Update'] {
  return {
    name: dto.name,
    phone: dto.phone,
    email: dto.email ?? null,
    notes: dto.notes ?? null,
    ...(dto.customAttributes !== undefined
      ? { custom_attributes: dto.customAttributes }
      : {}),
  } as any;
}
