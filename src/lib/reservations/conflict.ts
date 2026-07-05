import { normalizeSupabaseError } from '@/lib/error-handler';
import type { SupabaseServerClient } from '@/lib/supabase';

const RESERVATION_NO_OVERLAP_SQLSTATE = '23P01';
export const RESERVATION_CONFLICT_EXCLUDED_STATUSES = [
  'cancelled',
  'no_show',
] as const;
export const RESERVATION_CONFLICT_STATUS_FILTER =
  '("cancelled","no_show")' as const;

export type ReservationConflictClient = Pick<SupabaseServerClient, 'from'>;

export type ReservationConflictParams = {
  clinicId: string;
  staffId: string;
  startTime: string;
  endTime: string;
  excludeId?: string;
  excludeDeleted?: boolean;
  path?: string;
};

export function isReservationNoOverlapError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  return error.code === RESERVATION_NO_OVERLAP_SQLSTATE;
}

export async function hasReservationConflict(
  supabase: ReservationConflictClient,
  params: ReservationConflictParams
): Promise<boolean> {
  let query = supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', params.clinicId)
    .eq('staff_id', params.staffId);

  if (params.excludeDeleted) {
    query = query.eq('is_deleted', false);
  }

  query = query
    .lt('start_time', params.endTime)
    .gt('end_time', params.startTime)
    .not('status', 'in', RESERVATION_CONFLICT_STATUS_FILTER);

  if (params.excludeId) {
    query = query.neq('id', params.excludeId);
  }

  const { count, error } = await query;
  if (error) {
    throw normalizeSupabaseError(error, params.path);
  }

  return (count ?? 0) > 0;
}
