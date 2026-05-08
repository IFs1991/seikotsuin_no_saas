import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '../../../lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import type { Database } from '@/types/supabase';
import type {
  HourlyRevenue,
  MenuRanking,
  RevenueAnalysisData,
  RevenueTrend,
} from '@/types/api';

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
  'menu_id' | 'treatment_name' | 'fee'
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
const DAILY_REPORT_ITEM_SELECT = 'menu_id, treatment_name, fee';

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

function sumLastYearRevenue(reports: LastYearReportRow[]): number {
  return reports.reduce(
    (sum, report) => sum + Number(report.total_revenue ?? 0),
    0
  );
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

    const [dailyReportsResult, dailyReportItemsResult, lastYearReportsResult] =
      await Promise.all([
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

    const summary = summarizeDailyReports(
      dailyReportsResult.data ?? [],
      dateFilter
    );

    const lastYearTotal = sumLastYearRevenue(lastYearReportsResult.data ?? []);
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      clinic_id,
      patient_id,
      visit_id,
      amount,
      insurance_revenue,
      private_revenue,
      menu_id,
      payment_method_id,
    } = body;

    if (!clinic_id || !amount) {
      return NextResponse.json(
        { error: 'Required fields missing' },
        { status: 400 }
      );
    }

    const { supabase } = await ensureClinicAccess(request, PATH, clinic_id, {
      allowedRoles: ['manager'],
    });

    const { data, error } = await supabase
      .from('revenues')
      .insert({
        clinic_id,
        patient_id,
        visit_id,
        revenue_date: new Date().toISOString().split('T')[0],
        amount,
        insurance_revenue: insurance_revenue || 0,
        private_revenue: private_revenue || 0,
        menu_id,
        payment_method_id,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error('Revenue POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
