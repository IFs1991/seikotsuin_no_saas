import { z } from 'zod';
import {
  DEFAULT_RESERVATION_PAGE_SIZE,
  MAX_RESERVATION_PAGE_SIZE,
  MAX_RESERVATION_RANGE_DAYS,
  reservationTimestampSchema,
  decodeReservationCursor,
} from '@/lib/reservations/pagination';
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

export const reservationsQuerySchema = z
  .object({
    clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
    id: z.string().uuid().optional(),
    start_date: reservationTimestampSchema.optional(),
    end_date: reservationTimestampSchema.optional(),
    staff_id: z.string().uuid().optional(),
    customer_id: z.string().uuid().optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_RESERVATION_PAGE_SIZE)
      .default(DEFAULT_RESERVATION_PAGE_SIZE),
    cursor: z
      .string()
      .max(2048)
      .refine(
        value => decodeReservationCursor(value) !== null,
        'cursorが不正です'
      )
      .optional(),
  })
  .superRefine((query, context) => {
    if (query.id) return;
    if (!query.customer_id && (!query.start_date || !query.end_date)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '期間または患者を指定してください',
        path: ['start_date'],
      });
    }
    if (Boolean(query.start_date) !== Boolean(query.end_date)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '開始と終了を両方指定してください',
        path: ['end_date'],
      });
    }
    if (query.start_date && query.end_date) {
      const duration =
        Date.parse(query.end_date) - Date.parse(query.start_date);
      if (duration < 0 || duration >= MAX_RESERVATION_RANGE_DAYS * 86400000) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: '表示期間は開始順で42日以内にしてください',
          path: ['end_date'],
        });
      }
    }
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
    startTime: z.string().datetime({ offset: true }).optional(),
    endTime: z.string().datetime({ offset: true }).optional(),
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
