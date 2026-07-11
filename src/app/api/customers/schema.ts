import { z } from 'zod';
import type { Database, Json } from '@/types/supabase';

type CustomerInsertRow = Database['public']['Tables']['customers']['Insert'];
type CustomerUpdateRow = Database['public']['Tables']['customers']['Update'];

const customerCursorPayloadSchema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();

export type CustomerCursorPayload = z.infer<typeof customerCursorPayloadSchema>;

export const DEFAULT_CUSTOMER_PAGE_SIZE = 50;
export const MAX_CUSTOMER_PAGE_SIZE = 100;

export function encodeCustomerCursor(payload: CustomerCursorPayload): string {
  const parsed = customerCursorPayloadSchema.parse(payload);
  return Buffer.from(JSON.stringify(parsed), 'utf8').toString('base64url');
}

export function decodeCustomerCursor(
  value: string
): CustomerCursorPayload | null {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8')
    );
    const parsed = customerCursorPayloadSchema.safeParse(decoded);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

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

const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(jsonSchema),
  ])
);

const optionalCustomAttributes = z.record(jsonSchema).optional();

export const customersQuerySchema = z.object({
  clinic_id: z.string().uuid('有効なクリニックIDを指定してください'),
  q: searchQuerySchema,
  id: z.string().uuid('有効な顧客IDを指定してください').optional(),
  limit: z.coerce
    .number()
    .int('limitは整数で指定してください')
    .min(1, 'limitは1以上で指定してください')
    .max(
      MAX_CUSTOMER_PAGE_SIZE,
      `limitは${MAX_CUSTOMER_PAGE_SIZE}以下で指定してください`
    )
    .default(DEFAULT_CUSTOMER_PAGE_SIZE),
  cursor: z
    .string()
    .min(1, 'cursorを指定してください')
    .max(512, 'cursorが長すぎます')
    .regex(/^[A-Za-z0-9_-]+$/, 'cursorが不正です')
    .refine(value => decodeCustomerCursor(value) !== null, 'cursorが不正です')
    .optional(),
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
): CustomerInsertRow {
  return {
    clinic_id: dto.clinic_id,
    name: dto.name,
    phone: dto.phone,
    email: dto.email ?? null,
    notes: dto.notes ?? null,
    custom_attributes: dto.customAttributes ?? null,
    created_by: userId,
  };
}

export function mapCustomerUpdateToRow(
  dto: CustomerUpdateDTO
): CustomerUpdateRow {
  return {
    name: dto.name,
    phone: dto.phone,
    email: dto.email ?? null,
    notes: dto.notes ?? null,
    ...(dto.customAttributes !== undefined
      ? { custom_attributes: dto.customAttributes }
      : {}),
  };
}
