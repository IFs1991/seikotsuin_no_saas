import type { SupabaseServerClient } from '@/lib/supabase';
import {
  getJstDateUtcRange,
  REVIEW_SIGNAL_STATUSES,
  type ManagerDashboardCounts,
} from '@/lib/manager-dashboard';

type CountClient = Pick<SupabaseServerClient, 'from'>;
type CountResult = { count: number | null; error: unknown };

function exactCount(result: CountResult): number {
  if (result.error) throw result.error;
  if (
    result.count === null ||
    !Number.isSafeInteger(result.count) ||
    result.count < 0
  ) {
    throw new Error('Dashboard exact count unavailable');
  }
  return result.count;
}

async function reservationCount(
  client: CountClient,
  clinicId: string,
  date: string,
  cancelled: boolean
) {
  const range = getJstDateUtcRange(date);
  const query = client
    .from('reservation_list_view')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .gte('start_time', range.startIso)
    .lt('start_time', range.endIso);
  // Keep classifyReservationStatus semantics, including nullable legacy values.
  if (cancelled) query.in('status', ['cancelled', 'no_show', 'noshow']);
  else query.or('status.is.null,status.not.in.(cancelled,no_show,noshow)');
  return exactCount(await query.returns<never[]>());
}

export async function fetchManagerDashboardCounts(
  client: CountClient,
  clinicIds: readonly string[],
  date: { today: string; previousWeekday: string }
): Promise<ManagerDashboardCounts[]> {
  const results: ManagerDashboardCounts[] = [];
  // At most 16 requests in flight, even for a 50-clinic company.
  // HEAD exact counts run in PostgreSQL and never download reservation details.
  for (let offset = 0; offset < clinicIds.length; offset += 4) {
    const batch = await Promise.all(
      clinicIds.slice(offset, offset + 4).map(async clinicId => {
        const [todayActive, todayCancelled, previousActive, reviewResult] =
          await Promise.all([
            reservationCount(client, clinicId, date.today, false),
            reservationCount(client, clinicId, date.today, true),
            reservationCount(client, clinicId, date.previousWeekday, false),
            client
              .from('daily_report_items')
              .select('id', { count: 'exact', head: true })
              .eq('clinic_id', clinicId)
              .eq('report_date', date.today)
              .in('estimate_status', [...REVIEW_SIGNAL_STATUSES])
              .returns<never[]>(),
          ]);
        return {
          clinicId,
          todayActive,
          todayCancelled,
          previousActive,
          reviewCount: exactCount(reviewResult),
        };
      })
    );
    results.push(...batch);
  }
  return results;
}
