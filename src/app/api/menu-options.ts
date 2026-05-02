import { z } from 'zod';
import type { Json } from '@/types/supabase';
import type { MenuOption } from '@/types/reservation';

export const menuOptionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  priceDelta: z.number().default(0),
  durationDeltaMinutes: z.number().default(0),
  isActive: z.boolean().default(true),
});

export const menuOptionsSchema = z.array(menuOptionSchema);

export function normalizeMenuOptions(value: unknown): MenuOption[] {
  const parsed = menuOptionsSchema.safeParse(value);
  if (!parsed.success) return [];

  return parsed.data
    .map(option => {
      if (!option.id || !option.name) return null;

      return {
        id: option.id,
        name: option.name,
        priceDelta: option.priceDelta ?? 0,
        durationDeltaMinutes: option.durationDeltaMinutes ?? 0,
        isActive: option.isActive ?? true,
      };
    })
    .filter((option): option is MenuOption => option !== null);
}

export function mapMenuOptionsToJson(options: unknown): Json[] {
  return normalizeMenuOptions(options).map(option => ({
    id: option.id,
    name: option.name,
    priceDelta: option.priceDelta,
    durationDeltaMinutes: option.durationDeltaMinutes,
    isActive: option.isActive,
  }));
}
