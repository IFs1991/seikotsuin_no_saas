import { z } from 'zod';

export const DEFAULT_RESERVATION_PAGE_SIZE = 100;
export const MAX_RESERVATION_PAGE_SIZE = 200;
export const MAX_RESERVATION_RANGE_DAYS = 42;
export const reservationTimestampSchema = z.string().datetime({ offset: true });

const cursorSchema = z
  .object({
    version: z.literal(1),
    clinicId: z.string().uuid(),
    startDate: reservationTimestampSchema.nullable(),
    endDate: reservationTimestampSchema.nullable(),
    staffId: z.string().uuid().nullable(),
    customerId: z.string().uuid().nullable(),
    order: z.enum(['asc', 'desc']),
    startTime: reservationTimestampSchema,
    id: z.string().uuid(),
  })
  .strict();

export type ReservationCursor = z.infer<typeof cursorSchema>;
export type ReservationCursorContext = Omit<
  ReservationCursor,
  'version' | 'startTime' | 'id'
>;
export type ReservationPagination = {
  has_more: boolean;
  next_cursor: string | null;
};

export function encodeReservationCursor(payload: ReservationCursor): string {
  return Buffer.from(
    JSON.stringify(cursorSchema.parse(payload)),
    'utf8'
  ).toString('base64url');
}

export function decodeReservationCursor(
  value: string
): ReservationCursor | null {
  if (
    value.length === 0 ||
    value.length > 2048 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    return null;
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function matchesReservationCursor(
  cursor: ReservationCursor,
  context: ReservationCursorContext
): boolean {
  return (
    cursor.clinicId === context.clinicId &&
    cursor.startDate === context.startDate &&
    cursor.endDate === context.endDate &&
    cursor.staffId === context.staffId &&
    cursor.customerId === context.customerId &&
    cursor.order === context.order
  );
}

export function reservationCursorFilter(cursor: ReservationCursor): string {
  const validated = cursorSchema.parse(cursor);
  const comparison = validated.order === 'asc' ? 'gt' : 'lt';
  // Preserve PostgreSQL microseconds: Date.toISOString() would lose precision.
  return `start_time.${comparison}.${validated.startTime},and(start_time.eq.${validated.startTime},id.${comparison}.${validated.id})`;
}

export function buildReservationPagination(
  rows: readonly { id: string | null; start_time: string | null }[],
  count: number | null,
  context: ReservationCursorContext
): ReservationPagination {
  if (
    count === null ||
    !Number.isSafeInteger(count) ||
    count < rows.length ||
    (count > 0 && rows.length === 0)
  ) {
    throw new Error('Reservation page completeness could not be verified');
  }
  const hasMore = count > rows.length;
  const last = rows[rows.length - 1];
  if (!hasMore) return { has_more: false, next_cursor: null };
  if (!last?.id || !last.start_time)
    throw new Error('Reservation cursor position is unavailable');
  return {
    has_more: true,
    next_cursor: encodeReservationCursor({
      ...context,
      version: 1,
      id: last.id,
      startTime: last.start_time,
    }),
  };
}
