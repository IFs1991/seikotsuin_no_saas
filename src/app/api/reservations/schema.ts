import { z } from 'zod';
import type { Database } from '@/types/supabase';

type ReservationInsertRow =
  Database['public']['Tables']['reservations']['Insert'];
type ReservationUpdateRow =
  Database['public']['Tables']['reservations']['Update'];

export type ReservationPricingSnapshot = {
  isStaffRequested: boolean;
  staffNominationFee: number;
  price: number;
};

const statusEnum = z.enum([
  'tentative',
  'confirmed',
  'arrived',
  'completed',
  'cancelled',
  'no_show',
  'unconfirmed',
  'trial',
]);

const channelEnum = z.enum(['line', 'web', 'phone', 'walk_in']);

const optionSelectionSchema = z.object({
  optionId: z.string(),
  name: z.string(),
  priceDelta: z.number().default(0),
  durationDeltaMinutes: z.number().default(0),
});

export const reservationsQuerySchema = z.object({
  clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
  id: z.string().uuid().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  staff_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
});

export const reservationInsertSchema = z
  .object({
    clinic_id: z.string().uuid(),
    customerId: z.string().uuid(),
    menuId: z.string().uuid(),
    staffId: z.string().uuid(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    channel: channelEnum,
    notes: z.string().optional(),
    selectedOptions: z.array(optionSelectionSchema).optional(),
    isStaffRequested: z.boolean().default(false),
  })
  .strict();
export type ReservationInsertDTO = z.infer<typeof reservationInsertSchema>;

export const reservationUpdateSchema = z
  .object({
    clinic_id: z.string().uuid(),
    id: z.string().uuid(),
    status: statusEnum.optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    staffId: z.string().uuid().optional(),
    notes: z.string().optional(),
    selectedOptions: z.array(optionSelectionSchema).optional(),
    isStaffRequested: z.boolean().optional(),
  })
  .strict();
export type ReservationUpdateDTO = z.infer<typeof reservationUpdateSchema>;

export function mapReservationInsertToRow(
  dto: ReservationInsertDTO,
  userId: string,
  pricing: ReservationPricingSnapshot
): ReservationInsertRow {
  return {
    clinic_id: dto.clinic_id,
    customer_id: dto.customerId,
    menu_id: dto.menuId,
    staff_id: dto.staffId,
    start_time: dto.startTime,
    end_time: dto.endTime,
    channel: dto.channel,
    notes: dto.notes ?? null,
    selected_options: dto.selectedOptions ?? [],
    is_staff_requested: pricing.isStaffRequested,
    staff_nomination_fee: pricing.staffNominationFee,
    price: pricing.price,
    status: 'unconfirmed',
    created_by: userId,
  };
}

export function mapReservationUpdateToRow(
  dto: ReservationUpdateDTO,
  pricing?: ReservationPricingSnapshot
): ReservationUpdateRow {
  const row: ReservationUpdateRow = {};

  if (dto.status !== undefined) row.status = dto.status;
  if (dto.startTime !== undefined) row.start_time = dto.startTime;
  if (dto.endTime !== undefined) row.end_time = dto.endTime;
  if (dto.staffId !== undefined) row.staff_id = dto.staffId;
  if (dto.notes !== undefined) row.notes = dto.notes;
  if (dto.selectedOptions !== undefined)
    row.selected_options = dto.selectedOptions;
  if (pricing !== undefined) {
    row.is_staff_requested = pricing.isStaffRequested;
    row.staff_nomination_fee = pricing.staffNominationFee;
    row.price = pricing.price;
  }

  return row;
}
