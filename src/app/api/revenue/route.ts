import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '../../../lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import type { Database } from '@/types/supabase';
import type {
  CareEpisodeMetrics,
  HourlyRevenue,
  MenuRanking,
  RevenueAnalysisData,
  RevenueBreakdownSummary,
  RevenueContextSummary,
  RevenueTrend,
} from '@/types/api';
import type { SelectableRevenueContextCode } from '@/lib/revenue-context';
import { calculateCareEpisodeMetrics } from '@/lib/care-episode';
import { REVENUE_ESTIMATE_DISCLAIMER } from '@/lib/revenue-estimate';

const PATH = '/api/revenue';

type DailyReportRow = Pick<
  Database['public']['Tables']['daily_reports']['Row'],
  | 'report_date'
  | 'total_patients'
  | 'total_revenue'
  | 'insurance_revenue'
  | 'private_revenue'
>;

type DailyReportItemRow = Pick<
  Database['public']['Tables']['daily_report_items']['Row'],
  | 'menu_id'
  | 'treatment_name'
  | 'fee'
  | 'care_episode_id'
  | 'visit_ordinal_in_episode'
  | 'visit_stage_code'
>;

type RevenueContextSummaryRow = Pick<
  Database['public']['Views']['daily_report_revenue_context_summary']['Row'],
  | 'revenue_context_code'
  | 'revenue_context_name'
  | 'rollup_category'
  | 'total_revenue'
  | 'item_count'
  | 'needs_review_count'
  | 'blocked_count'
>;

type RevenueEstimateSummaryRow = Pick<
  Database['public']['Views']['daily_report_revenue_estimate_summary']['Row'],
  | 'estimated_total'
  | 'estimate_count'
  | 'calculated_count'
  | 'needs_review_count'
  | 'blocked_count'
  | 'overridden_count'
  | 'warning_count'
  | 'disclaimer'
>;

type RevenueBreakdownSummaryRow = Pick<
  Database['public']['Views']['daily_report_revenue_breakdown_summary']['Row'],
  'amount_role' | 'line_count' | 'estimated_amount'
>;

type LastYearReportRow = Pick<
  Database['public']['Tables']['daily_reports']['Row'],
  'total_revenue'
>;

type DateRange = {
  gte: string;
  lte: string;
};

type MenuRankingAccumulator = MenuRanking;
type RevenueSummary = {
  dailyRevenue: number;
  weeklyRevenue: number;
  totalRevenue: number;
  insuranceRevenue: number;
  privateRevenue: number;
  revenueTrends: RevenueTrend[];
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAILY_REPORT_SELECT =
  'report_date, total_patients, total_revenue, insurance_revenue, private_revenue';
const DAILY_REPORT_ITEM_SELECT =
  'menu_id, treatment_name, fee, care_episode_id, visit_ordinal_in_episode, visit_stage_code';
const REVENUE_CONTEXT_SUMMARY_SELECT =
  'revenue_context_code, revenue_context_name, rollup_category, total_revenue, item_count, needs_review_count, blocked_count';
const REVENUE_ESTIMATE_SUMMARY_SELECT =
  'estimated_total, estimate_count, calculated_count, needs_review_count, blocked_count, overridden_count, warning_count, disclaimer';
const REVENUE_BREAKDOWN_SUMMARY_SELECT =
  'amount_role, line_count, estimated_amount';

function toJSTDateString(date: Date = new Date()): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return jst.toISOString().slice(0, 10);
}

function formatDate(year: number, month: number, day: number): string {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

function parseDateParts(
  value: string
): { year: number; month: number; day: number } | null {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  return { year, month, day };
}

function addDaysToDateString(value: string, days: number): string {
  const parts = parseDateParts(value);
  if (!parts) {
    return value;
  }

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
    .toISOString()
    .slice(0, 10);
}

function addYearsToDateString(value: string, years: number): string {
  const parts = parseDateParts(value);
  if (!parts) {
    return value;
  }

  const targetYear = parts.year + years;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, parts.month, 0)
  ).getUTCDate();
  const targetDay = Math.min(parts.day, lastDayOfTargetMonth);

  return formatDate(targetYear, parts.month, targetDay);
}

function getCurrentJSTYearMonth(): { year: number; month: number } {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1,
  };
}

function getYearMonthFromDateString(value: string): {
  year: number;
  month: number;
} {
  const parts = parseDateParts(value);
  if (parts) {
    return {
      year: parts.year,
      month: parts.month,
    };
  }

  return getCurrentJSTYearMonth();
}

function resolveDateRange(
  period: string,
  startDate: string | null,
  endDate: string | null
): DateRange {
  const today = toJSTDateString();
  const lte = endDate || today;

  if (startDate) {
    return { gte: startDate, lte };
  }

  if (period === 'week') {
    return { gte: addDaysToDateString(lte, -6), lte };
  }

  if (period === 'year') {
    const { year } = getYearMonthFromDateString(lte);
    return { gte: `${year}-01-01`, lte };
  }

  const { year, month } = getYearMonthFromDateString(lte);
  return { gte: formatDate(year, month, 1), lte };
}

function summarizeDailyReports(
  reports: DailyReportRow[],
  dateRange: DateRange
): RevenueSummary {
  const weekStart = addDaysToDateString(dateRange.lte, -6);
  const summary: RevenueSummary = {
    dailyRevenue: 0,
    weeklyRevenue: 0,
    totalRevenue: 0,
    insuranceRevenue: 0,
    privateRevenue: 0,
    revenueTrends: [],
  };

  for (const report of reports) {
    const trend: RevenueTrend = {
      date: report.report_date,
      total_revenue: Number(report.total_revenue ?? 0),
      insurance_revenue: Number(report.insurance_revenue ?? 0),
      private_revenue: Number(report.private_revenue ?? 0),
      transaction_count: Number(report.total_patients ?? 0),
    };

    summary.totalRevenue += trend.total_revenue;
    summary.insuranceRevenue += trend.insurance_revenue;
    summary.privateRevenue += trend.private_revenue;

    if (trend.date === dateRange.lte) {
      summary.dailyRevenue = trend.total_revenue;
    }
    if (trend.date >= weekStart && trend.date <= dateRange.lte) {
      summary.weeklyRevenue += trend.total_revenue;
    }

    summary.revenueTrends.push(trend);
  }

  summary.revenueTrends.sort((left, right) =>
    left.date.localeCompare(right.date)
  );

  return summary;
}

function buildMenuRanking(items: DailyReportItemRow[]): MenuRanking[] {
  const rankingByName = new Map<string, MenuRankingAccumulator>();

  for (const item of items) {
    const menuName = item.treatment_name || 'その他';
    const existing = rankingByName.get(menuName);

    if (existing) {
      existing.total_revenue += Number(item.fee ?? 0);
      existing.transaction_count += 1;
      continue;
    }

    rankingByName.set(menuName, {
      menu_id: item.menu_id,
      menu_name: menuName,
      total_revenue: Number(item.fee ?? 0),
      transaction_count: 1,
    });
  }

  return Array.from(rankingByName.values())
    .sort(
      (left, right) =>
        right.total_revenue - left.total_revenue ||
        right.transaction_count - left.transaction_count ||
        left.menu_name.localeCompare(right.menu_name)
    )
    .slice(0, 10);
}

function normalizeRevenueContextCode(
  value: string | null
): SelectableRevenueContextCode | null {
  switch (value) {
    case 'insurance':
    case 'private':
    case 'traffic_accident':
    case 'workers_comp':
    case 'product':
    case 'ticket':
    case 'other':
      return value;
    default:
      return null;
  }
}

function buildRevenueContextSummary(
  rows: RevenueContextSummaryRow[]
): RevenueContextSummary[] {
  const summary: RevenueContextSummary[] = [];

  for (const row of rows) {
    const code = normalizeRevenueContextCode(row.revenue_context_code);
    if (!code) {
      continue;
    }

    summary.push({
      code,
      name: row.revenue_context_name ?? code,
      rollupCategory: row.rollup_category ?? 'other',
      totalRevenue: Number(row.total_revenue ?? 0),
      itemCount: Number(row.item_count ?? 0),
      needsReviewCount: Number(row.needs_review_count ?? 0),
      blockedCount: Number(row.blocked_count ?? 0),
    });
  }

  return summary;
}

function sumContextRevenueByCode(
  summary: RevenueContextSummary[],
  code: SelectableRevenueContextCode
): number {
  return summary
    .filter(item => item.code === code)
    .reduce((sum, item) => sum + item.totalRevenue, 0);
}

function sumLastYearRevenue(reports: LastYearReportRow[]): number {
  return reports.reduce(
    (sum, report) => sum + Number(report.total_revenue ?? 0),
    0
  );
}

function buildRevenueEstimateSummary(rows: RevenueEstimateSummaryRow[]) {
  return rows.reduce(
    (summary, row) => ({
      estimatedTotal: summary.estimatedTotal + Number(row.estimated_total ?? 0),
      estimateCount: summary.estimateCount + Number(row.estimate_count ?? 0),
      calculatedCount:
        summary.calculatedCount + Number(row.calculated_count ?? 0),
      needsReviewCount:
        summary.needsReviewCount + Number(row.needs_review_count ?? 0),
      blockedCount: summary.blockedCount + Number(row.blocked_count ?? 0),
      overriddenCount:
        summary.overriddenCount + Number(row.overridden_count ?? 0),
      warningCount: summary.warningCount + Number(row.warning_count ?? 0),
      disclaimer: row.disclaimer ?? summary.disclaimer,
    }),
    {
      estimatedTotal: 0,
      estimateCount: 0,
      calculatedCount: 0,
      needsReviewCount: 0,
      blockedCount: 0,
      overriddenCount: 0,
      warningCount: 0,
      disclaimer: REVENUE_ESTIMATE_DISCLAIMER,
    }
  );
}

function buildRevenueBreakdownSummary(
  rows: RevenueBreakdownSummaryRow[]
): RevenueBreakdownSummary[] {
  return rows
    .filter(row => row.amount_role !== null)
    .map(row => ({
      amountRole: row.amount_role ?? '',
      lineCount: Number(row.line_count ?? 0),
      estimatedAmount: Number(row.estimated_amount ?? 0),
    }));
}

function sumBreakdownByRole(
  summary: RevenueBreakdownSummary[],
  amountRole: string
): number {
  return summary
    .filter(item => item.amountRole === amountRole)
    .reduce((sum, item) => sum + item.estimatedAmount, 0);
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clinicId = searchParams.get('clinic_id');
    const period = searchParams.get('period') || 'month';
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinic_id is required' },
        { status: 400 }
      );
    }

    const dateFilter = resolveDateRange(period, startDate, endDate);

    const { supabase } = await ensureClinicAccess(request, PATH, clinicId);

    const lastYearStart = addYearsToDateString(dateFilter.gte, -1);
    const lastYearEnd = addYearsToDateString(dateFilter.lte, -1);

    const [
      dailyReportsResult,
      dailyReportItemsResult,
      lastYearReportsResult,
      revenueContextSummaryResult,
      revenueEstimateSummaryResult,
      revenueBreakdownSummaryResult,
    ] = await Promise.all([
      supabase
        .from('daily_reports')
        .select(DAILY_REPORT_SELECT)
        .eq('clinic_id', clinicId)
        .gte('report_date', dateFilter.gte)
        .lte('report_date', dateFilter.lte),
      supabase
        .from('daily_report_items')
        .select(DAILY_REPORT_ITEM_SELECT)
        .eq('clinic_id', clinicId)
        .gte('report_date', dateFilter.gte)
        .lte('report_date', dateFilter.lte),
      supabase
        .from('daily_reports')
        .select('total_revenue')
        .eq('clinic_id', clinicId)
        .gte('report_date', lastYearStart)
        .lte('report_date', lastYearEnd),
      supabase
        .from('daily_report_revenue_context_summary')
        .select(REVENUE_CONTEXT_SUMMARY_SELECT)
        .eq('clinic_id', clinicId)
        .gte('report_date', dateFilter.gte)
        .lte('report_date', dateFilter.lte),
      supabase
        .from('daily_report_revenue_estimate_summary')
        .select(REVENUE_ESTIMATE_SUMMARY_SELECT)
        .eq('clinic_id', clinicId)
        .gte('report_date', dateFilter.gte)
        .lte('report_date', dateFilter.lte),
      supabase
        .from('daily_report_revenue_breakdown_summary')
        .select(REVENUE_BREAKDOWN_SUMMARY_SELECT)
        .eq('clinic_id', clinicId)
        .gte('report_date', dateFilter.gte)
        .lte('report_date', dateFilter.lte),
    ]);

    if (dailyReportsResult.error) {
      throw dailyReportsResult.error;
    }
    if (dailyReportItemsResult.error) {
      throw dailyReportItemsResult.error;
    }
    if (lastYearReportsResult.error) {
      throw lastYearReportsResult.error;
    }
    if (revenueContextSummaryResult.error) {
      throw revenueContextSummaryResult.error;
    }
    if (revenueEstimateSummaryResult.error) {
      throw revenueEstimateSummaryResult.error;
    }
    if (revenueBreakdownSummaryResult.error) {
      throw revenueBreakdownSummaryResult.error;
    }

    const summary = summarizeDailyReports(
      dailyReportsResult.data ?? [],
      dateFilter
    );
    const revenueContextSummary = buildRevenueContextSummary(
      revenueContextSummaryResult.data ?? []
    );

    const lastYearTotal = sumLastYearRevenue(lastYearReportsResult.data ?? []);
    const careEpisodeMetrics: CareEpisodeMetrics = calculateCareEpisodeMetrics(
      dailyReportItemsResult.data ?? []
    );
    const revenueEstimateSummary = buildRevenueEstimateSummary(
      revenueEstimateSummaryResult.data ?? []
    );
    const revenueBreakdownSummary = buildRevenueBreakdownSummary(
      revenueBreakdownSummaryResult.data ?? []
    );
    const growthRate =
      lastYearTotal > 0
        ? (
            ((summary.totalRevenue - lastYearTotal) / lastYearTotal) *
            100
          ).toFixed(1)
        : '0';

    const hourlyRevenue: HourlyRevenue[] = [];
    const responseData: RevenueAnalysisData = {
      dailyRevenue: summary.dailyRevenue,
      weeklyRevenue: summary.weeklyRevenue,
      monthlyRevenue: summary.totalRevenue,
      insuranceRevenue: summary.insuranceRevenue,
      selfPayRevenue: summary.privateRevenue,
      menuRanking: buildMenuRanking(dailyReportItemsResult.data ?? []),
      hourlyRevenue,
      revenueForecast: summary.totalRevenue * 1.1,
      growthRate: `${growthRate}%`,
      revenueTrends: summary.revenueTrends,
      costAnalysis: '32.5%',
      staffRevenueContribution: [],
      revenueContextSummary,
      trafficAccidentRevenue: sumContextRevenueByCode(
        revenueContextSummary,
        'traffic_accident'
      ),
      workersCompRevenue: sumContextRevenueByCode(
        revenueContextSummary,
        'workers_comp'
      ),
      patientCopayEstimated: sumBreakdownByRole(
        revenueBreakdownSummary,
        'patient_copay_estimated'
      ),
      insurerReceivableEstimated: sumBreakdownByRole(
        revenueBreakdownSummary,
        'insurer_receivable_estimated'
      ),
      privateRevenueEstimated: sumBreakdownByRole(
        revenueBreakdownSummary,
        'private_revenue_estimated'
      ),
      trafficAccidentEstimated: sumBreakdownByRole(
        revenueBreakdownSummary,
        'traffic_accident_receivable_estimated'
      ),
      workersCompEstimated: sumBreakdownByRole(
        revenueBreakdownSummary,
        'workers_comp_receivable_estimated'
      ),
      productRevenue: sumContextRevenueByCode(revenueContextSummary, 'product'),
      ticketRevenue: sumContextRevenueByCode(revenueContextSummary, 'ticket'),
      careEpisodeMetrics,
      revenueEstimateSummary,
      revenueBreakdownSummary,
    };

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error('Revenue API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json(
    {
      error:
        'POST /api/revenue is deprecated. Use /api/daily-reports/items instead.',
    },
    { status: 410 }
  );
}
