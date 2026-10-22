import 'server-only';

import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database } from '@/types/supabase';
import type { DailyReportPayload } from './schema';

type DailyReportRow = Database['public']['Tables']['daily_reports']['Row'];
type SaveDailyReportArgs =
  Database['public']['Functions']['save_daily_report']['Args'];

type SaveDailyReportError = {
  code?: string;
  message?: string;
  details?: string | null;
};

export type DailyReportSaveResult =
  | { ok: true; report: DailyReportRow }
  | {
      ok: false;
      status: 400;
      message: string;
      fieldErrors: Record<string, string[]>;
    }
  | { ok: false; status: 403; message: string }
  | { ok: false; status: 409; message: string };

export type DailyReportSaveOptions = {
  /**
   * Refuse (409) instead of saving when the report's totals are derived from
   * detail rows. Used by forms that only edit hand-entered totals (mobile).
   */
  requireManual?: boolean;
};

function mapDailyReportPayloadToSaveArgs(
  payload: DailyReportPayload,
  options: DailyReportSaveOptions
): SaveDailyReportArgs {
  return {
    p_clinic_id: payload.clinic_id,
    p_report_date: payload.report_date,
    p_report_id: payload.id,
    p_staff_id: payload.staff_id ?? undefined,
    // Ignored by the DB for itemized reports (aggregate_source = 'items').
    p_total_patients: payload.total_patients,
    p_new_patients: payload.new_patients,
    p_total_revenue: payload.total_revenue,
    p_insurance_revenue: payload.insurance_revenue,
    p_private_revenue: payload.private_revenue,
    p_report_text: payload.report_text ?? undefined,
    ...(options.requireManual ? { p_require_manual: true } : {}),
  };
}

function buildDerivedTotalMessage(details: string | null | undefined): string {
  const derivedTotal =
    typeof details === 'string' && /^\d+$/.test(details) ? details : null;
  return derivedTotal === null
    ? '新患数は明細から集計した総患者数以下で入力してください'
    : `新患数は明細から集計した総患者数（${derivedTotal}名）以下で入力してください`;
}

function mapSaveDailyReportError(
  error: SaveDailyReportError
): DailyReportSaveResult | null {
  if (error.code === '55000' && error.message === 'DAILY_REPORT_ITEMIZED') {
    return {
      ok: false,
      status: 409,
      message:
        'この日の日報は明細から自動集計されるため、合計を保存できません。PCの日報入力画面で明細を修正してください',
    };
  }

  if (error.code === '42501') {
    if (error.message === 'DAILY_REPORT_NOT_ACCESSIBLE') {
      return {
        ok: false,
        status: 403,
        message: '日報へのアクセス権がありません',
      };
    }
    if (error.message === 'DAILY_REPORT_STAFF_NOT_ACCESSIBLE') {
      return {
        ok: false,
        status: 403,
        message: '日報担当スタッフへのアクセス権がありません',
      };
    }
    return null;
  }

  if (error.code !== '23514') {
    return null;
  }

  switch (error.message) {
    case 'DAILY_REPORT_NEW_PATIENTS_EXCEEDS_TOTAL': {
      const message = 'new_patientsはtotal_patients以下で入力してください';
      return {
        ok: false,
        status: 400,
        message,
        fieldErrors: { new_patients: [message] },
      };
    }
    case 'DAILY_REPORT_NEW_PATIENTS_EXCEEDS_DERIVED_TOTAL': {
      const message = buildDerivedTotalMessage(error.details);
      return {
        ok: false,
        status: 400,
        message,
        fieldErrors: { new_patients: [message] },
      };
    }
    case 'DAILY_REPORT_REVENUE_BREAKDOWN_EXCEEDS_TOTAL': {
      const message =
        'total_revenueは保険診療と自費診療の合計以上である必要があります';
      return {
        ok: false,
        status: 400,
        message,
        fieldErrors: { total_revenue: [message] },
      };
    }
    default:
      return null;
  }
}

/**
 * Saves the human-edited body of a daily report through the single atomic DB
 * boundary (public.save_daily_report). The report's clinic/date, report_id
 * and staff_id scope, the manual/items type decision, the totals and the
 * new_patients validation are all resolved under one row lock in the DB.
 * With options.requireManual an item-derived report is refused (409) there,
 * before any column is written.
 * See docs/stabilization/spec-os-daily-report-aggregate-authority-v0.1.md.
 */
export async function saveDailyReport(
  supabase: SupabaseServerClient,
  payload: DailyReportPayload,
  options: DailyReportSaveOptions = {}
): Promise<DailyReportSaveResult> {
  const { data, error } = await supabase.rpc(
    'save_daily_report',
    mapDailyReportPayloadToSaveArgs(payload, options)
  );

  if (error) {
    const mapped = mapSaveDailyReportError(error);
    if (mapped) {
      return mapped;
    }
    throw error;
  }

  if (!data) {
    throw new Error('save_daily_report returned no row');
  }

  return { ok: true, report: data };
}
