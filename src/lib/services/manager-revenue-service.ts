import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ManagerRevenueAnalysisBucket,
  ManagerRevenueContextBreakdownRow,
  ManagerRevenuePeriodSeriesRow,
  ManagerRevenuePeriodTotalsRow,
} from '@/lib/manager-revenue-analysis';
import type { Database } from '@/types/supabase';

export type ManagerRevenueClient = Pick<SupabaseClient<Database>, 'rpc'>;

export async function fetchManagerRevenuePeriodTotals(
  supabase: ManagerRevenueClient,
  clinicIds: readonly string[],
  startDate: string | null,
  endDate: string | null
): Promise<ManagerRevenuePeriodTotalsRow[]> {
  if (clinicIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase.rpc('manager_revenue_period_totals', {
    p_clinic_ids: [...clinicIds],
    p_start: startDate ?? undefined,
    p_end: endDate ?? undefined,
  });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchManagerRevenuePeriodSeries(
  supabase: ManagerRevenueClient,
  clinicIds: readonly string[],
  startDate: string | null,
  endDate: string | null,
  bucket: ManagerRevenueAnalysisBucket
): Promise<ManagerRevenuePeriodSeriesRow[]> {
  if (clinicIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase.rpc('manager_revenue_period_series', {
    p_clinic_ids: [...clinicIds],
    p_start: startDate ?? undefined,
    p_end: endDate ?? undefined,
    p_bucket: bucket,
  });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchManagerRevenueContextBreakdown(
  supabase: ManagerRevenueClient,
  clinicIds: readonly string[],
  startDate: string | null,
  endDate: string | null
): Promise<ManagerRevenueContextBreakdownRow[]> {
  if (clinicIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase.rpc(
    'manager_revenue_context_breakdown',
    {
      p_clinic_ids: [...clinicIds],
      p_start: startDate ?? undefined,
      p_end: endDate ?? undefined,
    }
  );

  if (error) {
    throw error;
  }

  return data ?? [];
}
