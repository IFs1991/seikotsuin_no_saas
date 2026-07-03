import { normalizeSupabaseError } from '@/lib/error-handler';
import type { SupabaseServerClient } from '@/lib/supabase';

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
    .not('status', 'in', '("cancelled","no_show")');

  if (params.excludeId) {
    query = query.neq('id', params.excludeId);
  }

  const { count, error } = await query;
  if (error) {
    throw normalizeSupabaseError(error, params.path);
  }

  return (count ?? 0) > 0;
}
