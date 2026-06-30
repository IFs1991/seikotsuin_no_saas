import 'server-only';

import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database } from '@/types/supabase';
import type { DailyReportPayload } from './schema';

type DailyReportRow = Database['public']['Tables']['daily_reports']['Row'];
type DailyReportInsert =
  Database['public']['Tables']['daily_reports']['Insert'];

export type DailyReportWriteScopeResult =
  | { ok: true }
  | { ok: false; status: 403; message: string };

function mapDailyReportPayloadToInsert(
  payload: DailyReportPayload
): DailyReportInsert {
  return {
    clinic_id: payload.clinic_id,
    staff_id: payload.staff_id ?? null,
    report_date: payload.report_date,
    total_patients: payload.total_patients,
    new_patients: payload.new_patients,
    total_revenue: payload.total_revenue,
    insurance_revenue: payload.insurance_revenue,
    private_revenue: payload.private_revenue,
    report_text: payload.report_text ?? null,
  };
}

export async function validateDailyReportWriteScope(
  supabase: SupabaseServerClient,
  payload: DailyReportPayload
): Promise<DailyReportWriteScopeResult> {
  if (payload.id) {
    const { data, error } = await supabase
      .from('daily_reports')
      .select('id')
      .eq('id', payload.id)
      .eq('clinic_id', payload.clinic_id)
      .eq('report_date', payload.report_date)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return {
        ok: false,
        status: 403,
        message: '日報へのアクセス権がありません',
      };
    }
  }

  if (!payload.staff_id) {
    return { ok: true };
  }

  const { data, error } = await supabase
    .from('staff')
    .select('id')
    .eq('clinic_id', payload.clinic_id)
    .eq('id', payload.staff_id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return {
      ok: false,
      status: 403,
      message: '日報担当スタッフへのアクセス権がありません',
    };
  }

  return { ok: true };
}

export async function upsertDailyReport(
  supabase: SupabaseServerClient,
  payload: DailyReportPayload
): Promise<DailyReportRow> {
  const { data, error } = await supabase
    .from('daily_reports')
    .upsert(mapDailyReportPayloadToInsert(payload), {
      onConflict: 'clinic_id,report_date',
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
