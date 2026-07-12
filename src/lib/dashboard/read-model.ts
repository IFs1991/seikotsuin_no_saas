import 'server-only';

import { logError } from '@/lib/error-handler';
import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database } from '@/types/supabase';
import type { DashboardData, HeatmapPoint } from '@/types/api';

const JST_TIMEZONE = 'Asia/Tokyo' as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_LOG_SCOPE = 'dashboard.readModel';
const NO_ROWS_ERROR_CODE = 'PGRST116';
const DAILY_REVENUE_SELECT =
  'total_revenue, insurance_revenue, private_revenue';
const DAILY_REPORT_PATIENT_SELECT = 'total_patients';
const REVENUE_CHART_SELECT =
  'revenue_date, total_revenue, insurance_revenue, private_revenue';
const AI_COMMENT_SELECT =
  'id, summary, good_points, improvement_points, suggestion_for_tomorrow, created_at';
const ALERT_THRESHOLDS = {
  REVENUE_DECREASE: 0.2,
  REVENUE_INCREASE: 0.3,
  PATIENTS_DECREASE: 0.2,
  PATIENTS_INCREASE: 0.3,
} as const;

const JST_DATE_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: JST_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

type DashboardSupabaseError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type DashboardQueryResponse = {
  data: unknown;
  error: DashboardSupabaseError | null;
};

export type DashboardReadModelClient = {
  dailyRevenue(params: {
    clinicId: string;
    today: string;
  }): PromiseLike<DashboardQueryResponse>;
  previousRevenue(params: {
    clinicId: string;
    yesterday: string;
  }): PromiseLike<DashboardQueryResponse>;
  dailyReportPatients(params: {
    clinicId: string;
    reportDate: string;
  }): PromiseLike<DashboardQueryResponse>;
  aiComment(params: {
    clinicId: string;
    today: string;
  }): PromiseLike<DashboardQueryResponse>;
  revenueChartRows(params: {
    clinicId: string;
    sevenDaysAgo: string;
  }): PromiseLike<DashboardQueryResponse>;
  heatmap(params: { clinicId: string }): PromiseLike<DashboardQueryResponse>;
};

type DailyRevenueSummaryRow = Pick<
  Database['public']['Views']['daily_revenue_summary']['Row'],
  'total_revenue' | 'insurance_revenue' | 'private_revenue'
>;

type DailyRevenuePreviousRow = Pick<
  Database['public']['Views']['daily_revenue_summary']['Row'],
  'total_revenue'
>;

type RevenueChartRow = Pick<
  Database['public']['Views']['daily_revenue_summary']['Row'],
  'revenue_date' | 'total_revenue' | 'insurance_revenue' | 'private_revenue'
>;

type DailyReportPatientCountRow = Pick<
  Database['public']['Tables']['daily_reports']['Row'],
  'total_patients'
>;

type AiCommentRow = Pick<
  Database['public']['Tables']['ai_comments']['Row'],
  | 'id'
  | 'summary'
  | 'good_points'
  | 'improvement_points'
  | 'suggestion_for_tomorrow'
  | 'created_at'
>;

type DashboardDateKeys = {
  today: string;
  yesterday: string;
  sevenDaysAgo: string;
};

export type FetchDashboardReadModelParams = {
  supabase: DashboardReadModelClient;
  clinicId: string;
  now?: Date;
};

export function createDashboardSupabaseReadModelClient(
  supabase: SupabaseServerClient,
  legacyAnalyticsSupabase: SupabaseServerClient = supabase
): DashboardReadModelClient {
  return {
    dailyRevenue: async params => {
      const { data, error } = await supabase
        .from('daily_revenue_summary')
        .select(DAILY_REVENUE_SELECT)
        .eq('clinic_id', params.clinicId)
        .eq('revenue_date', params.today)
        .maybeSingle();
      return { data, error };
    },
    previousRevenue: async params => {
      const { data, error } = await supabase
        .from('daily_revenue_summary')
        .select('total_revenue')
        .eq('clinic_id', params.clinicId)
        .eq('revenue_date', params.yesterday)
        .maybeSingle();
      return { data, error };
    },
    dailyReportPatients: async params => {
      const { data, error } = await supabase
        .from('daily_reports')
        .select(DAILY_REPORT_PATIENT_SELECT)
        .eq('clinic_id', params.clinicId)
        .eq('report_date', params.reportDate)
        .maybeSingle();
      return { data, error };
    },
    aiComment: async params => {
      const { data, error } = await supabase
        .from('ai_comments')
        .select(AI_COMMENT_SELECT)
        .eq('clinic_id', params.clinicId)
        .eq('comment_date', params.today)
        .maybeSingle();
      return { data, error };
    },
    revenueChartRows: async params => {
      const { data, error } = await supabase
        .from('daily_revenue_summary')
        .select(REVENUE_CHART_SELECT)
        .eq('clinic_id', params.clinicId)
        .gte('revenue_date', params.sevenDaysAgo)
        .order('revenue_date', { ascending: true });
      return { data, error };
    },
    heatmap: async params => {
      const { data, error } = await legacyAnalyticsSupabase.rpc(
        'get_hourly_visit_pattern',
        {
          clinic_uuid: params.clinicId,
        }
      );
      return { data, error };
    },
  };
}

function toJstDateKey(date: Date): string {
  return JST_DATE_KEY_FORMATTER.format(date);
}

function parseDateKey(dateKey: string): Date {
  const [yearText, monthText, dayText] = dateKey.split('-');
  return new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText))
  );
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function getDashboardDateKeys(now: Date): DashboardDateKeys {
  const today = toJstDateKey(now);
  return {
    today,
    yesterday: addDaysToDateKey(today, -1),
    sevenDaysAgo: addDaysToDateKey(today, -7),
  };
}

function isNoRowsError(error: DashboardSupabaseError | null): boolean {
  return error?.code === NO_ROWS_ERROR_CODE;
}

async function resolveOptionalSingle(
  responsePromise: PromiseLike<DashboardQueryResponse>
): Promise<unknown | null> {
  const { data, error } = await responsePromise;

  if (error && !isNoRowsError(error)) {
    throw error;
  }

  return data ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toNumber(value: number | string | null | undefined): number {
  const resolved = typeof value === 'string' ? Number(value) : value;
  return typeof resolved === 'number' && Number.isFinite(resolved)
    ? resolved
    : 0;
}

function normalizeTextList(
  value: string | readonly string[] | null | undefined
): string[] {
  if (!value) {
    return [];
  }

  if (typeof value === 'string') {
    return [value];
  }

  return value.filter((item): item is string => Boolean(item));
}

function mapAiComment(row: AiCommentRow | null): DashboardData['aiComment'] {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    summary: row.summary ?? '',
    highlights: normalizeTextList(row.good_points),
    improvements: normalizeTextList(row.improvement_points),
    suggestions: normalizeTextList(row.suggestion_for_tomorrow),
    created_at: row.created_at ?? '',
  };
}

function mapRevenueChartData(
  rows: readonly RevenueChartRow[]
): DashboardData['revenueChartData'] {
  return rows.map(row => ({
    name: row.revenue_date ?? '',
    総売上: toNumber(row.total_revenue),
    保険診療: toNumber(row.insurance_revenue),
    自費診療: toNumber(row.private_revenue),
  }));
}

function toDailyRevenueSummaryRow(
  value: unknown
): DailyRevenueSummaryRow | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    total_revenue: readNumber(value.total_revenue),
    insurance_revenue: readNumber(value.insurance_revenue),
    private_revenue: readNumber(value.private_revenue),
  };
}

function toDailyRevenuePreviousRow(
  value: unknown
): DailyRevenuePreviousRow | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    total_revenue: readNumber(value.total_revenue),
  };
}

function toDailyReportPatientCountRow(
  value: unknown
): DailyReportPatientCountRow | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    total_patients: readNumber(value.total_patients),
  };
}

function toAiCommentRow(value: unknown): AiCommentRow | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  if (!id) {
    return null;
  }

  return {
    id,
    summary: readString(value.summary),
    good_points: readString(value.good_points),
    improvement_points: readString(value.improvement_points),
    suggestion_for_tomorrow: readString(value.suggestion_for_tomorrow),
    created_at: readString(value.created_at),
  };
}

function toRevenueChartRow(value: unknown): RevenueChartRow | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    revenue_date: readString(value.revenue_date),
    total_revenue: readNumber(value.total_revenue),
    insurance_revenue: readNumber(value.insurance_revenue),
    private_revenue: readNumber(value.private_revenue),
  };
}

function toHeatmapPoint(value: unknown): HeatmapPoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const hourOfDay = readNumber(value.hour_of_day);
  const dayOfWeek = readNumber(value.day_of_week);
  const visitCount = readNumber(value.visit_count);

  if (hourOfDay === null || dayOfWeek === null || visitCount === null) {
    return null;
  }

  return {
    hour_of_day: hourOfDay,
    day_of_week: dayOfWeek,
    visit_count: visitCount,
    avg_revenue: readNumber(value.avg_revenue),
  };
}

function mapRows<T>(
  values: readonly unknown[],
  mapper: (value: unknown) => T | null
): T[] {
  const rows: T[] = [];

  for (const value of values) {
    const mapped = mapper(value);
    if (mapped) {
      rows.push(mapped);
    }
  }

  return rows;
}

function buildAlerts(params: {
  todayRevenue: number;
  previousRevenue: number;
  todayPatients: number;
  previousPatients: number;
  hasTodayPatientReport: boolean;
  hasYesterdayPatientReport: boolean;
}): string[] {
  const alerts: string[] = [];

  if (params.previousRevenue > 0) {
    const revenueChange =
      (params.todayRevenue - params.previousRevenue) / params.previousRevenue;
    if (revenueChange < -ALERT_THRESHOLDS.REVENUE_DECREASE) {
      const changePercent = Math.abs(Math.round(revenueChange * 100));
      alerts.push(
        `売上が前日比${changePercent}%減少しています（前日: ${params.previousRevenue.toLocaleString()}, 本日: ${params.todayRevenue.toLocaleString()}）`
      );
    } else if (revenueChange > ALERT_THRESHOLDS.REVENUE_INCREASE) {
      const changePercent = Math.round(revenueChange * 100);
      alerts.push(
        `売上が前日比${changePercent}%増加しています（前日: ${params.previousRevenue.toLocaleString()}, 本日: ${params.todayRevenue.toLocaleString()}）`
      );
    }
  }

  if (
    params.hasTodayPatientReport &&
    params.hasYesterdayPatientReport &&
    params.previousPatients > 0
  ) {
    const patientsChange =
      (params.todayPatients - params.previousPatients) /
      params.previousPatients;
    if (patientsChange < -ALERT_THRESHOLDS.PATIENTS_DECREASE) {
      const changePercent = Math.abs(Math.round(patientsChange * 100));
      alerts.push(
        `患者数が前日比${changePercent}%減少しています（前日: ${params.previousPatients}名, 本日: ${params.todayPatients}名）`
      );
    } else if (patientsChange > ALERT_THRESHOLDS.PATIENTS_INCREASE) {
      const changePercent = Math.round(patientsChange * 100);
      alerts.push(
        `患者数が前日比${changePercent}%増加しています（前日: ${params.previousPatients}名, 本日: ${params.todayPatients}名）`
      );
    }
  }

  return alerts;
}

async function fetchTodayRevenue(params: {
  supabase: DashboardReadModelClient;
  clinicId: string;
  today: string;
}): Promise<DailyRevenueSummaryRow | null> {
  const row = await resolveOptionalSingle(
    params.supabase.dailyRevenue({
      clinicId: params.clinicId,
      today: params.today,
    })
  );
  return toDailyRevenueSummaryRow(row);
}

async function fetchPreviousRevenue(params: {
  supabase: DashboardReadModelClient;
  clinicId: string;
  yesterday: string;
}): Promise<DailyRevenuePreviousRow | null> {
  const row = await resolveOptionalSingle(
    params.supabase.previousRevenue({
      clinicId: params.clinicId,
      yesterday: params.yesterday,
    })
  );
  return toDailyRevenuePreviousRow(row);
}

async function fetchDailyReportPatientCount(params: {
  supabase: DashboardReadModelClient;
  clinicId: string;
  reportDate: string;
}): Promise<DailyReportPatientCountRow | null> {
  const row = await resolveOptionalSingle(
    params.supabase.dailyReportPatients({
      clinicId: params.clinicId,
      reportDate: params.reportDate,
    })
  );
  return toDailyReportPatientCountRow(row);
}

async function fetchAiComment(params: {
  supabase: DashboardReadModelClient;
  clinicId: string;
  today: string;
}): Promise<AiCommentRow | null> {
  const { data, error } = await params.supabase.aiComment({
    clinicId: params.clinicId,
    today: params.today,
  });

  if (error && !isNoRowsError(error)) {
    logError(new Error('Failed to fetch AI comments'), {
      scope: DASHBOARD_LOG_SCOPE,
      clinicId: params.clinicId,
      aiError: error,
    });
    return null;
  }

  return toAiCommentRow(data);
}

async function fetchRevenueChartData(params: {
  supabase: DashboardReadModelClient;
  clinicId: string;
  sevenDaysAgo: string;
}): Promise<RevenueChartRow[]> {
  const { data, error } = await params.supabase.revenueChartRows({
    clinicId: params.clinicId,
    sevenDaysAgo: params.sevenDaysAgo,
  });

  if (error) {
    throw error;
  }

  return isUnknownArray(data) ? mapRows(data, toRevenueChartRow) : [];
}

async function fetchHeatmapData(params: {
  supabase: DashboardReadModelClient;
  clinicId: string;
}): Promise<HeatmapPoint[]> {
  const { data, error } = await params.supabase.heatmap({
    clinicId: params.clinicId,
  });

  if (error) {
    logError(new Error('Failed to fetch heatmap data'), {
      scope: DASHBOARD_LOG_SCOPE,
      clinicId: params.clinicId,
      heatmapError: error,
    });
    return [];
  }

  return isUnknownArray(data) ? mapRows(data, toHeatmapPoint) : [];
}

export async function fetchDashboardReadModel(
  params: FetchDashboardReadModelParams
): Promise<DashboardData> {
  const dateKeys = getDashboardDateKeys(params.now ?? new Date());
  const [
    dailyRevenue,
    todayReport,
    aiComment,
    revenueChartRows,
    heatmapData,
    previousRevenue,
    yesterdayReport,
  ] = await Promise.all([
    fetchTodayRevenue({
      supabase: params.supabase,
      clinicId: params.clinicId,
      today: dateKeys.today,
    }),
    fetchDailyReportPatientCount({
      supabase: params.supabase,
      clinicId: params.clinicId,
      reportDate: dateKeys.today,
    }),
    fetchAiComment({
      supabase: params.supabase,
      clinicId: params.clinicId,
      today: dateKeys.today,
    }),
    fetchRevenueChartData({
      supabase: params.supabase,
      clinicId: params.clinicId,
      sevenDaysAgo: dateKeys.sevenDaysAgo,
    }),
    fetchHeatmapData({
      supabase: params.supabase,
      clinicId: params.clinicId,
    }),
    fetchPreviousRevenue({
      supabase: params.supabase,
      clinicId: params.clinicId,
      yesterday: dateKeys.yesterday,
    }),
    fetchDailyReportPatientCount({
      supabase: params.supabase,
      clinicId: params.clinicId,
      reportDate: dateKeys.yesterday,
    }),
  ]);

  const todayRevenue = toNumber(dailyRevenue?.total_revenue);
  const todayPatients = toNumber(todayReport?.total_patients);
  const previousRevenueAmount = toNumber(previousRevenue?.total_revenue);
  const previousPatients = toNumber(yesterdayReport?.total_patients);

  return {
    dailyData: {
      revenue: todayRevenue,
      patients: todayPatients,
      insuranceRevenue: toNumber(dailyRevenue?.insurance_revenue),
      privateRevenue: toNumber(dailyRevenue?.private_revenue),
    },
    aiComment: mapAiComment(aiComment),
    revenueChartData: mapRevenueChartData(revenueChartRows),
    heatmapData,
    alerts: buildAlerts({
      todayRevenue,
      previousRevenue: previousRevenueAmount,
      todayPatients,
      previousPatients,
      hasTodayPatientReport: todayReport !== null,
      hasYesterdayPatientReport: yesterdayReport !== null,
    }),
  };
}
