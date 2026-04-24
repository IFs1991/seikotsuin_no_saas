import { z } from 'zod';
import type { Database } from '@/types/supabase';

const optionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  priceDelta: z.number().default(0),
  durationDeltaMinutes: z.number().default(0),
  isActive: z.boolean().default(true),
});

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
    options: z.array(optionSchema).optional(),
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
    options: z.array(optionSchema).optional(),
  })
  .strict();
export type MenuTemplateUpdateDTO = z.infer<typeof menuTemplateUpdateSchema>;

export interface MenuTemplateRow {
  id: string;
  owner_clinic_id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  price: number | string;
  duration_minutes: number;
  is_insurance_applicable?: boolean | null;
  options?: unknown;
  is_active?: boolean | null;
  display_order?: number | null;
}

export interface MenuTemplateApi {
  id: string;
  ownerClinicId: string;
  name: string;
  description: string;
  category?: string;
  price: number;
  durationMinutes: number;
  isInsuranceApplicable: boolean;
  options: unknown[];
  isActive: boolean;
  displayOrder: number;
}

export function mapMenuTemplateInsertToRow(
  dto: MenuTemplateInsertDTO,
  userId: string
) {
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
    options: dto.options ?? [],
    created_by: userId,
  };
}

export function mapMenuTemplateUpdateToRow(dto: MenuTemplateUpdateDTO) {
  const row: Record<string, unknown> = {};

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
  if (dto.options !== undefined) row.options = dto.options;

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
    options: Array.isArray(row.options) ? row.options : [],
    isActive: row.is_active ?? true,
    displayOrder: row.display_order ?? 0,
  };
}

export function mapTemplateToMenuInsertRow(
  template: MenuTemplateRow,
  targetClinicId: string,
  userId: string
): Database['public']['Tables']['menus']['Insert'] {
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
    options: Array.isArray(template.options) ? template.options : [],
    created_by: userId,
  } as any;
}
