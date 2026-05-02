import { z } from 'zod';
import type { Database } from '@/types/supabase';
import type { Menu } from '@/types/reservation';
import {
  mapMenuOptionsToJson,
  menuOptionsSchema,
  normalizeMenuOptions,
} from '@/app/api/menu-options';

type MenuInsertRow = Database['public']['Tables']['menus']['Insert'];
type MenuUpdateRow = Database['public']['Tables']['menus']['Update'];
type MenuDbRow = Database['public']['Tables']['menus']['Row'];

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
    options: menuOptionsSchema.optional(),
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
    options: menuOptionsSchema.optional(),
  })
  .strict();
export type MenuUpdateDTO = z.infer<typeof menuUpdateSchema>;

export type MenuRow = Pick<
  MenuDbRow,
  | 'id'
  | 'clinic_id'
  | 'name'
  | 'duration_minutes'
  | 'price'
  | 'description'
  | 'category'
  | 'is_insurance_applicable'
  | 'is_active'
  | 'options'
>;

export function mapMenuInsertToRow(
  dto: MenuInsertDTO,
  userId: string
): MenuInsertRow {
  return {
    clinic_id: dto.clinic_id,
    name: dto.name,
    description: dto.description ?? null,
    category: dto.category ?? null,
    price: dto.price,
    duration_minutes: dto.durationMinutes,
    is_insurance_applicable: dto.isInsuranceApplicable ?? false,
    is_active: dto.isActive,
    options: mapMenuOptionsToJson(dto.options),
    created_by: userId,
  };
}

export function mapMenuUpdateToRow(dto: MenuUpdateDTO): MenuUpdateRow {
  const row: MenuUpdateRow = {};

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
  if (dto.options !== undefined) {
    row.options = mapMenuOptionsToJson(dto.options);
  }

  return row;
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
    options: normalizeMenuOptions(row.options),
  };
}
