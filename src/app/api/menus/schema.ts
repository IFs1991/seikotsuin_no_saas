import { z } from 'zod';
import type { Database } from '@/types/supabase';
import type { Menu } from '@/types/reservation';

const optionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  priceDelta: z.number().default(0),
  durationDeltaMinutes: z.number().default(0),
  isActive: z.boolean().default(true),
});

export const menusQuerySchema = z.object({
  clinic_id: z.string().uuid(),
});

export const menuInsertSchema = z
  .object({
    clinic_id: z.string().uuid(),
    name: z.string().trim().min(1).max(255),
    description: z.string().optional(),
    category: z.string().trim().max(100).optional(),
    price: z.number().min(0),
    durationMinutes: z.number().int().min(1),
    isInsuranceApplicable: z.boolean().optional(),
    isActive: z.boolean().default(true),
    options: z.array(optionSchema).optional(),
  })
  .strict();
export type MenuInsertDTO = z.infer<typeof menuInsertSchema>;

export const menuUpdateSchema = z
  .object({
    clinic_id: z.string().uuid(),
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().optional(),
    category: z.string().trim().max(100).optional(),
    price: z.number().min(0).optional(),
    durationMinutes: z.number().int().min(1).optional(),
    isInsuranceApplicable: z.boolean().optional(),
    isActive: z.boolean().optional(),
    options: z.array(optionSchema).optional(),
  })
  .strict();
export type MenuUpdateDTO = z.infer<typeof menuUpdateSchema>;

export interface MenuRow {
  id: string;
  clinic_id?: string | null;
  name: string;
  duration_minutes: number;
  price: number | string;
  description?: string | null;
  category?: string | null;
  is_insurance_applicable?: boolean | null;
  is_active?: boolean | null;
  options?: unknown;
}

export function mapMenuInsertToRow(
  dto: MenuInsertDTO,
  userId: string
): Database['public']['Tables']['menus']['Insert'] {
  return {
    clinic_id: dto.clinic_id,
    name: dto.name,
    description: dto.description ?? null,
    category: dto.category ?? null,
    price: dto.price,
    duration_minutes: dto.durationMinutes,
    is_insurance_applicable: dto.isInsuranceApplicable ?? false,
    is_active: dto.isActive,
    options: dto.options ?? [],
    created_by: userId,
  } as any;
}

export function mapMenuUpdateToRow(
  dto: MenuUpdateDTO
): Database['public']['Tables']['menus']['Update'] {
  const row: Record<string, unknown> = {};

  if (dto.name !== undefined) row.name = dto.name;
  if (dto.description !== undefined) row.description = dto.description || null;
  if (dto.category !== undefined) row.category = dto.category || null;
  if (dto.price !== undefined) row.price = dto.price;
  if (dto.durationMinutes !== undefined)
    row.duration_minutes = dto.durationMinutes;
  if (dto.isInsuranceApplicable !== undefined) {
    row.is_insurance_applicable = dto.isInsuranceApplicable;
  }
  if (dto.isActive !== undefined) row.is_active = dto.isActive;
  if (dto.options !== undefined) row.options = dto.options;

  return row as any;
}

export function mapMenuRowToApi(row: MenuRow): Menu {
  return {
    id: row.id,
    clinicId: row.clinic_id ?? undefined,
    name: row.name,
    durationMinutes: row.duration_minutes,
    price: Number(row.price),
    description: row.description ?? '',
    category: row.category ?? undefined,
    isInsuranceApplicable: row.is_insurance_applicable ?? false,
    isActive: row.is_active ?? true,
    options: Array.isArray(row.options) ? row.options : [],
  };
}
