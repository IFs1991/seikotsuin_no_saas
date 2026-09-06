import 'server-only';

import type { SupabaseServerClient } from '@/lib/supabase';
import { logPerf, nowMs } from '@/lib/performance/server-timing';
import type { Database } from '@/types/supabase';
import { fetchAllRows } from '@/lib/manager-fetch';

export const DAILY_REPORT_SELECT = `
  id,
  report_date,
  staff_id,
  total_patients,
  new_patients,
  total_revenue,
  insurance_revenue,
  private_revenue,
  report_text,
  created_at,
  staff(name, role)
`;

type DailyReportRow = Database['public']['Tables']['daily_reports']['Row'];
type DailyReportMetricRow = Pick<
  DailyReportRow,
  'report_date' | 'total_patients' | 'total_revenue'
>;
type DailyReportAggregateRow = {
  totalReports: number;
  totalPatients: number | null;
  totalRevenue: number | null;
};

type StaffReadRow = {
  name: string | null;
  role: string | null;
};

type DailyReportReadRow = Pick<
  DailyReportRow,
  | 'id'
  | 'report_date'
  | 'staff_id'
  | 'total_patients'
  | 'new_patients'
  | 'total_revenue'
  | 'insurance_revenue'
  | 'private_revenue'
  | 'report_text'
  | 'created_at'
> & {
  staff: StaffReadRow | StaffReadRow[] | null;
};

export type DailyReportApiResponse = {
  id: DailyReportRow['id'];
  reportDate: string;
  staffName: string;
  totalPatients: number | null;
  newPatients: number | null;
  totalRevenue: number;
  insuranceRevenue: number;
  privateRevenue: number;
  reportText: string | null;
  createdAt: string | null;
};

export type DailyReportsSummary = {
  totalReports: number;
  averagePatients: number;
  averageRevenue: number;
  totalRevenue: number;
};

export type MonthlyTrend = {
  month: string;
  reports: number;
  totalPatients: number;
  totalRevenue: number;
};

export type DailyReportsReadModel = {
  reports: DailyReportApiResponse[];
  summary: DailyReportsSummary;
  monthlyTrends: MonthlyTrend[];
};

function getStaffNameFromReport(report: DailyReportReadRow): string {
  const staff = report.staff;
  if (Array.isArray(staff)) {
    return staff[0]?.name ?? '未設定';
  }

  return staff?.name ?? '未設定';
}

function mapReport(report: DailyReportReadRow): DailyReportApiResponse {
  return {
    id: report.id,
    reportDate: report.report_date,
    staffName: getStaffNameFromReport(report),
    totalPatients: report.total_patients,
    newPatients: report.new_patients,
    totalRevenue: report.total_revenue ?? 0,
    insuranceRevenue: report.insurance_revenue ?? 0,
    privateRevenue: report.private_revenue ?? 0,
    reportText: report.report_text,
    createdAt: report.created_at,
  };
}

function buildSummary(aggregate: DailyReportAggregateRow): DailyReportsSummary {
  const totalReports = aggregate.totalReports;
  const totalRevenue = aggregate.totalRevenue ?? 0;
  return {
    totalReports,
    averagePatients:
      totalReports > 0 ? (aggregate.totalPatients ?? 0) / totalReports : 0,
    averageRevenue: totalReports > 0 ? totalRevenue / totalReports : 0,
    totalRevenue,
  };
}

function buildMonthlyTrends(reports: DailyReportMetricRow[]): MonthlyTrend[] {
  const monthlyTrends = reports.reduce<Record<string, MonthlyTrend>>(
    (acc, report) => {
      const month = report.report_date.slice(0, 7);
      acc[month] ??= {
        month,
        reports: 0,
        totalPatients: 0,
        totalRevenue: 0,
      };
      acc[month].reports += 1;
      acc[month].totalPatients += report.total_patients ?? 0;
      acc[month].totalRevenue += report.total_revenue ?? 0;
      return acc;
    },
    {}
  );

  return Object.values(monthlyTrends);
}

export async function fetchDailyReportsReadModel(params: {
  supabase: SupabaseServerClient;
  clinicId: string;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<DailyReportsReadModel> {
  function scopedQuery(selection: string) {
    let query = params.supabase
      .from('daily_reports')
      .select(selection)
      .eq('clinic_id', params.clinicId);
    if (params.startDate) query = query.gte('report_date', params.startDate);
    if (params.endDate) query = query.lte('report_date', params.endDate);
    return query;
  }

  const tQuery = nowMs();
  // 一覧は最新30件。サマリーは期間全件をDB集計し、月別用の必要列は
  // clinic_id + report_date の一意順でページ取得して1,000行上限を避ける。
  const [listResult, aggregateResult, trendRows] = await Promise.all([
    scopedQuery(DAILY_REPORT_SELECT)
      .returns<DailyReportReadRow[]>()
      .order('report_date', { ascending: false })
      .limit(30),
    scopedQuery(
      'totalReports:id.count(),totalPatients:total_patients.sum(),totalRevenue:total_revenue.sum()'
    ).returns<DailyReportAggregateRow[]>(),
    fetchAllRows((from, to) =>
      scopedQuery('report_date,total_patients,total_revenue')
        .returns<DailyReportMetricRow[]>()
        .order('report_date', { ascending: false })
        .range(from, to)
    ),
  ]);
  const { data, error } = listResult;
  logPerf('dailyReports.query', tQuery, {
    clinicId: params.clinicId,
    count: data?.length ?? 0,
  });

  if (error) {
    throw error;
  }
  if (aggregateResult.error) throw aggregateResult.error;
  const aggregate = aggregateResult.data?.[0];
  if (!aggregate) throw new Error('日報集計を取得できませんでした');

  const reports = data ?? [];
  const tMapping = nowMs();
  const readModel = {
    reports: reports.map(mapReport),
    summary: buildSummary(aggregate),
    monthlyTrends: buildMonthlyTrends(trendRows),
  };
  logPerf('dailyReports.mapping', tMapping, {
    count: readModel.reports.length,
  });

  return readModel;
}

export async function fetchDailyReportByIdReadModel(params: {
  supabase: SupabaseServerClient;
  clinicId: string;
  reportId: string;
}): Promise<DailyReportApiResponse | null> {
  const tQuery = nowMs();
  const { data, error } = await params.supabase
    .from('daily_reports')
    .select(DAILY_REPORT_SELECT)
    .eq('id', params.reportId)
    .eq('clinic_id', params.clinicId)
    .returns<DailyReportReadRow>()
    .maybeSingle();
  logPerf('dailyReports.query', tQuery, {
    clinicId: params.clinicId,
    count: data ? 1 : 0,
    reportId: params.reportId,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const tMapping = nowMs();
  const report = mapReport(data);
  logPerf('dailyReports.mapping', tMapping, {
    count: 1,
    reportId: params.reportId,
  });

  return report;
}
