import { z } from 'zod';
import type { Database } from '@/types/supabase';

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

export const customersQuerySchema = z.object({
  clinic_id: z.string().uuid(),
  q: z.string().optional(),
});

export const customerInsertSchema = z
  .object({
    clinic_id: z.string().uuid(),
    name: z.string().trim().min(1).max(255),
    phone: z.string().trim().min(1).max(32),
    email: optionalTrimmedString(255),
    notes: optionalTrimmedString(2000),
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
  } as any;
}

