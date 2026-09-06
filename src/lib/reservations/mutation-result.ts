import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database } from '@/types/supabase';
import { captureOperationalError } from '@/lib/monitoring/sentry';
import {
  mapReservationListViewRow,
  RESERVATION_LIST_SELECT,
  type ReservationListItem,
} from './read-model';

export const RESERVATION_MUTATION_RETURN_SELECT =
  'id, clinic_id, customer_id, menu_id, status, start_time, end_time, staff_id, channel, notes, selected_options, intake_responses, is_staff_requested, staff_nomination_fee, updated_at';

type SavedReservation = Pick<
  Database['public']['Tables']['reservations']['Row'],
  | 'id'
  | 'clinic_id'
  | 'customer_id'
  | 'menu_id'
  | 'status'
  | 'start_time'
  | 'end_time'
  | 'staff_id'
  | 'channel'
  | 'notes'
  | 'selected_options'
  | 'intake_responses'
  | 'is_staff_requested'
  | 'staff_nomination_fee'
  | 'updated_at'
>;

export async function readCommittedReservation(
  client: SupabaseServerClient,
  saved: SavedReservation
): Promise<ReservationListItem> {
  try {
    const { data, error } = await client
      .from('reservation_list_view')
      .select(RESERVATION_LIST_SELECT)
      .eq('clinic_id', saved.clinic_id)
      .eq('id', saved.id)
      .maybeSingle();
    if (!error && data) return mapReservationListViewRow(data);
  } catch {
    // 保存後の表示データ取得障害で、保存済み操作を失敗扱いにしない。
  }

  await captureOperationalError(
    new Error('Reservation projection unavailable'),
    {
      source: 'reservation-projection',
      operation: 'read_after_commit',
      status: 503,
    }
  );
  return {
    ...mapReservationListViewRow({
      ...saved,
      customer_name: null,
      menu_name: null,
      staff_name: null,
    }),
    projectionStatus: 'unavailable',
  };
}

export const RESERVATION_CONCURRENT_UPDATE_MESSAGE =
  '他の操作で予約が更新されました。最新の予約を読み込み、変更内容を確認してください。';
