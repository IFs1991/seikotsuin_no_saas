import { z } from 'zod';
import type { Database } from '@/types/supabase';

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
    price: z.number().min(0),
    durationMinutes: z.number().int().min(1),
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
    price: z.number().min(0).optional(),
    durationMinutes: z.number().int().min(1).optional(),
    isActive: z.boolean().optional(),
    options: z.array(optionSchema).optional(),
  })
  .strict();
export type MenuUpdateDTO = z.infer<typeof menuUpdateSchema>;

export function mapMenuInsertToRow(
  dto: MenuInsertDTO,
  userId: string
): Database['public']['Tables']['menus']['Insert'] {
  return {
    clinic_id: dto.clinic_id,
    name: dto.name,
    description: dto.description ?? null,
    price: dto.price,
    duration_minutes: dto.durationMinutes,
    is_active: dto.isActive,
    options: dto.options ?? [],
    created_by: userId,
  } as any;
}

export function mapMenuUpdateToRow(
  dto: MenuUpdateDTO
): Database['public']['Tables']['menus']['Update'] {
  return {
    name: dto.name,
    description: dto.description ?? null,
    price: dto.price,
    duration_minutes: dto.durationMinutes,
    is_active: dto.isActive,
    options: dto.options,
  } as any;
}
