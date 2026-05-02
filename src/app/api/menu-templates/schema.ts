import { z } from 'zod';
import type { Database } from '@/types/supabase';
import type { MenuOption } from '@/types/reservation';
import {
  mapMenuOptionsToJson,
  menuOptionsSchema,
  normalizeMenuOptions,
} from '@/app/api/menu-options';

type MenuInsertRow = Database['public']['Tables']['menus']['Insert'];
type MenuTemplateInsertRow =
  Database['public']['Tables']['menu_templates']['Insert'];
type MenuTemplateUpdateRow =
  Database['public']['Tables']['menu_templates']['Update'];
type MenuTemplateDbRow = Database['public']['Tables']['menu_templates']['Row'];

export const menuTemplatesQuerySchema = z.object({
  clinic_id: z.string().uuid(),
});

export const menuTemplateDeleteQuerySchema = z.object({
  owner_clinic_id: z.string().uuid(),
  id: z.string().uuid(),
});

export const menuTemplateImportSchema = z
  .object({
    clinic_id: z.string().uuid(),
    template_id: z.string().uuid(),
  })
  .strict();
export type MenuTemplateImportDTO = z.infer<typeof menuTemplateImportSchema>;

export const menuTemplateInsertSchema = z
  .object({
    owner_clinic_id: z.string().uuid(),
    name: z.string().trim().min(1).max(255),
    description: z.string().optional(),
    category: z.string().trim().max(100).optional(),
    price: z.number().min(0),
    durationMinutes: z.number().int().min(1),
    isInsuranceApplicable: z.boolean().optional(),
    isActive: z.boolean().default(true),
    displayOrder: z.number().int().optional(),
    options: menuOptionsSchema.optional(),
  })
  .strict();
export type MenuTemplateInsertDTO = z.infer<typeof menuTemplateInsertSchema>;

export const menuTemplateUpdateSchema = z
  .object({
    owner_clinic_id: z.string().uuid(),
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().optional(),
    category: z.string().trim().max(100).optional(),
    price: z.number().min(0).optional(),
    durationMinutes: z.number().int().min(1).optional(),
    isInsuranceApplicable: z.boolean().optional(),
    isActive: z.boolean().optional(),
    displayOrder: z.number().int().optional(),
    options: menuOptionsSchema.optional(),
  })
  .strict();
export type MenuTemplateUpdateDTO = z.infer<typeof menuTemplateUpdateSchema>;

export type MenuTemplateRow = Pick<
  MenuTemplateDbRow,
  | 'id'
  | 'owner_clinic_id'
  | 'name'
  | 'description'
  | 'category'
  | 'price'
  | 'duration_minutes'
  | 'is_insurance_applicable'
  | 'options'
  | 'is_active'
  | 'display_order'
>;

export interface MenuTemplateApi {
  id: string;
  ownerClinicId: string;
  name: string;
  description: string;
  category?: string;
  price: number;
  durationMinutes: number;
  isInsuranceApplicable: boolean;
  options: MenuOption[];
  isActive: boolean;
  displayOrder: number;
}

export function mapMenuTemplateInsertToRow(
  dto: MenuTemplateInsertDTO,
  userId: string
): MenuTemplateInsertRow {
  return {
    owner_clinic_id: dto.owner_clinic_id,
    name: dto.name,
    description: dto.description ?? null,
    category: dto.category ?? null,
    price: dto.price,
    duration_minutes: dto.durationMinutes,
    is_insurance_applicable: dto.isInsuranceApplicable ?? false,
    is_active: dto.isActive,
    display_order: dto.displayOrder ?? 0,
    options: mapMenuOptionsToJson(dto.options),
    created_by: userId,
  };
}

export function mapMenuTemplateUpdateToRow(
  dto: MenuTemplateUpdateDTO
): MenuTemplateUpdateRow {
  const row: MenuTemplateUpdateRow = {};

  if (dto.name !== undefined) row.name = dto.name;
  if (dto.description !== undefined) row.description = dto.description || null;
  if (dto.category !== undefined) row.category = dto.category || null;
  if (dto.price !== undefined) row.price = dto.price;
  if (dto.durationMinutes !== undefined) {
    row.duration_minutes = dto.durationMinutes;
  }
  if (dto.isInsuranceApplicable !== undefined) {
    row.is_insurance_applicable = dto.isInsuranceApplicable;
  }
  if (dto.isActive !== undefined) row.is_active = dto.isActive;
  if (dto.displayOrder !== undefined) row.display_order = dto.displayOrder;
  if (dto.options !== undefined) {
    row.options = mapMenuOptionsToJson(dto.options);
  }

  return row;
}

export function mapMenuTemplateRowToApi(row: MenuTemplateRow): MenuTemplateApi {
  return {
    id: row.id,
    ownerClinicId: row.owner_clinic_id,
    name: row.name,
    description: row.description ?? '',
    category: row.category ?? undefined,
    price: Number(row.price),
    durationMinutes: row.duration_minutes,
    isInsuranceApplicable: row.is_insurance_applicable ?? false,
    options: normalizeMenuOptions(row.options),
    isActive: row.is_active ?? true,
    displayOrder: row.display_order ?? 0,
  };
}

export function mapTemplateToMenuInsertRow(
  template: MenuTemplateRow,
  targetClinicId: string,
  userId: string
): MenuInsertRow {
  return {
    clinic_id: targetClinicId,
    name: template.name,
    description: template.description ?? null,
    category: template.category ?? null,
    price: Number(template.price),
    duration_minutes: template.duration_minutes,
    is_insurance_applicable: template.is_insurance_applicable ?? false,
    is_active: true,
    display_order: template.display_order ?? 0,
    options: mapMenuOptionsToJson(template.options),
    created_by: userId,
  };
}
