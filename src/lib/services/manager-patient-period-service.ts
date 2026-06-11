import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import type {
  ManagerPatientAnalysisBucket,
  ManagerPatientPeriodSeriesRow,
  ManagerPatientPeriodTotalsRow,
} from '@/lib/manager-patient-analysis';

export type ManagerPatientPeriodClient = Pick<SupabaseClient<Database>, 'rpc'>;

export async function fetchManagerPatientPeriodTotals(
  supabase: ManagerPatientPeriodClient,
  clinicIds: readonly string[],
  startIso: string | null,
  endIso: string | null
): Promise<ManagerPatientPeriodTotalsRow[]> {
  if (clinicIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase.rpc('manager_patient_period_totals', {
    p_clinic_ids: [...clinicIds],
    p_start: startIso,
    p_end: endIso,
  });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchManagerPatientPeriodSeries(
  supabase: ManagerPatientPeriodClient,
  clinicIds: readonly string[],
  startIso: string | null,
  endIso: string | null,
  bucket: ManagerPatientAnalysisBucket
): Promise<ManagerPatientPeriodSeriesRow[]> {
  if (clinicIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase.rpc('manager_patient_period_series', {
    p_clinic_ids: [...clinicIds],
    p_start: startIso,
    p_end: endIso,
    p_bucket: bucket,
  });

  if (error) {
    throw error;
  }

  return data ?? [];
}
