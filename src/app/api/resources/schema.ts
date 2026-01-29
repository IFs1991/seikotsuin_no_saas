import { z } from 'zod';
import type { Database } from '@/types/supabase';

const typeEnum = z.enum(['staff', 'room', 'bed', 'device']);

export const resourcesQuerySchema = z.object({
  clinic_id: z.string().uuid(),
  type: typeEnum.optional(),
});

export const resourceInsertSchema = z
  .object({
    clinic_id: z.string().uuid(),
    name: z.string().trim().min(1).max(255),
    type: typeEnum,
    workingHours: z.record(z.any()).optional(),
    supportedMenus: z.array(z.string().uuid()).optional(),
    maxConcurrent: z.number().int().min(1).default(1),
    isActive: z.boolean().default(true),
  })
  .strict();
export type ResourceInsertDTO = z.infer<typeof resourceInsertSchema>;

export const resourceUpdateSchema = z
  .object({
    clinic_id: z.string().uuid(),
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(255).optional(),
    workingHours: z.record(z.any()).optional(),
    supportedMenus: z.array(z.string().uuid()).optional(),
    maxConcurrent: z.number().int().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type ResourceUpdateDTO = z.infer<typeof resourceUpdateSchema>;

export function mapResourceInsertToRow(
  dto: ResourceInsertDTO,
  userId: string
): Database['public']['Tables']['resources']['Insert'] {
  return {
    clinic_id: dto.clinic_id,
    name: dto.name,
    type: dto.type,
    working_hours: dto.workingHours ?? undefined,
    supported_menus: dto.supportedMenus ?? undefined,
    max_concurrent: dto.maxConcurrent,
    is_active: dto.isActive,
    created_by: userId,
  } as any;
}

export function mapResourceUpdateToRow(
  dto: ResourceUpdateDTO
): Database['public']['Tables']['resources']['Update'] {
  return {
    name: dto.name,
    working_hours: dto.workingHours,
    supported_menus: dto.supportedMenus,
    max_concurrent: dto.maxConcurrent,
    is_active: dto.isActive,
  } as any;
}
