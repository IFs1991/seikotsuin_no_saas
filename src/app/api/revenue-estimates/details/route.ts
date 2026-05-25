import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';
import {
  AppError,
  getStatusCodeFromErrorCode,
  normalizeSupabaseError,
} from '@/lib/error-handler';
import { isSelectableRevenueContextCode } from '@/lib/revenue-context';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import type { RevenueEstimateAmountDetail } from '@/types/api';
import type { Database } from '@/types/supabase';

const PATH = '/api/revenue-estimates/details';
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DETAIL_CONTEXTS = [
  'insurance',
  'workers_comp',
  'traffic_accident',
] as const;
const DAILY_REPORT_ITEM_SELECT =
  'id, report_date, patient_name, treatment_name, fee, revenue_context_code, estimate_status, visit_stage_code, menu_billing_profile_id, customer_insurance_coverage_id, patient_burden_rate, coverage_resolution_source, pricing_snapshot_status, pricing_confirmed_at';
const REVENUE_ESTIMATE_SELECT =
  'id, daily_report_item_id, revenue_context_code, estimate_status, estimated_total, disclaimer, calculated_at, calculation_version, used_schedule_code, source_snapshot_hash';
const REVENUE_ESTIMATE_LINE_SELECT =
  'id, revenue_estimate_id, line_type, label, quantity, unit_amount, total_amount, sort_order, amount_role, insurance_fee_item_id, schedule_code, fee_item_code, source_snapshot_hash';
const REVENUE_ESTIMATE_WARNING_SELECT =
  'id, revenue_estimate_id, warning_code, severity, message';

type DailyReportItemRow = Pick<
  Database['public']['Tables']['daily_report_items']['Row'],
  | 'id'
  | 'report_date'
  | 'patient_name'
  | 'treatment_name'
  | 'fee'
  | 'revenue_context_code'
  | 'estimate_status'
  | 'visit_stage_code'
  | 'menu_billing_profile_id'
  | 'customer_insurance_coverage_id'
  | 'patient_burden_rate'
  | 'coverage_resolution_source'
  | 'pricing_snapshot_status'
  | 'pricing_confirmed_at'
>;

type RevenueEstimateRow = Pick<
  Database['public']['Tables']['revenue_estimates']['Row'],
  | 'id'
  | 'daily_report_item_id'
  | 'revenue_context_code'
  | 'estimate_status'
  | 'estimated_total'
  | 'disclaimer'
  | 'calculated_at'
  | 'calculation_version'
  | 'used_schedule_code'
  | 'source_snapshot_hash'
>;

type RevenueEstimateLineRow = Pick<
  Database['public']['Tables']['revenue_estimate_lines']['Row'],
  | 'id'
  | 'revenue_estimate_id'
  | 'line_type'
  | 'label'
  | 'quantity'
  | 'unit_amount'
  | 'total_amount'
  | 'sort_order'
  | 'amount_role'
  | 'insurance_fee_item_id'
  | 'schedule_code'
  | 'fee_item_code'
  | 'source_snapshot_hash'
>;

type RevenueEstimateWarningRow = Pick<
  Database['public']['Tables']['revenue_estimate_warnings']['Row'],
  'id' | 'revenue_estimate_id' | 'warning_code' | 'severity' | 'message'
>;

type DateRange = {
  gte: string;
  lte: string;
};

function toJSTDateString(date: Date = new Date()): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return jst.toISOString().slice(0, 10);
}

function parseLimit(value: string | null): number {
  if (value === null) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function isDateString(value: string | null): value is string {
  return value !== null && DATE_PATTERN.test(value);
}

function addDaysToDateString(value: string, days: number): string {
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function resolveDateRange(
  period: string,
  startDate: string | null,
  endDate: string | null
): DateRange {
  const lte = isDateString(endDate) ? endDate : toJSTDateString();
  if (isDateString(startDate)) {
    return { gte: startDate, lte };
  }

  if (period === 'week') {
    return { gte: addDaysToDateString(lte, -6), lte };
  }

  if (period === 'year') {
    return { gte: `${lte.slice(0, 4)}-01-01`, lte };
  }

  return { gte: `${lte.slice(0, 7)}-01`, lte };
}

function groupByEstimateId<T extends { revenue_estimate_id: string }>(
  rows: T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const existing = grouped.get(row.revenue_estimate_id) ?? [];
    existing.push(row);
    grouped.set(row.revenue_estimate_id, existing);
  }
  return grouped;
}

function buildDetails(
  itemRows: DailyReportItemRow[],
  estimateRows: RevenueEstimateRow[],
  lineRows: RevenueEstimateLineRow[],
  warningRows: RevenueEstimateWarningRow[]
): RevenueEstimateAmountDetail[] {
  const estimateByItemId = new Map(
    estimateRows.map(estimate => [estimate.daily_report_item_id, estimate])
  );
  const linesByEstimateId = groupByEstimateId(lineRows);
  const warningsByEstimateId = groupByEstimateId(warningRows);
  const details: RevenueEstimateAmountDetail[] = [];

  for (const item of itemRows) {
    const estimate = estimateByItemId.get(item.id);
    if (
      !estimate ||
      !isSelectableRevenueContextCode(item.revenue_context_code)
    ) {
      continue;
    }

    details.push({
      dailyReportItemId: item.id,
      reportDate: item.report_date,
      patientName: item.patient_name,
      treatmentName: item.treatment_name,
      manualFee: Number(item.fee ?? 0),
      revenueContextCode: item.revenue_context_code,
      visitStageCode: item.visit_stage_code,
      menuBillingProfileId: item.menu_billing_profile_id,
      customerInsuranceCoverageId: item.customer_insurance_coverage_id,
      patientBurdenRate: item.patient_burden_rate,
      coverageResolutionSource: item.coverage_resolution_source,
      pricingSnapshotStatus: item.pricing_snapshot_status,
      pricingConfirmedAt: item.pricing_confirmed_at,
      estimateId: estimate.id,
      estimateStatus: estimate.estimate_status,
      estimatedTotal: Number(estimate.estimated_total ?? 0),
      disclaimer: estimate.disclaimer,
      calculatedAt: estimate.calculated_at,
      calculationVersion: estimate.calculation_version,
      usedScheduleCode: estimate.used_schedule_code,
      sourceSnapshotHash: estimate.source_snapshot_hash,
      lines: (linesByEstimateId.get(estimate.id) ?? []).map(line => ({
        id: line.id,
        lineType: line.line_type,
        label: line.label,
        quantity: Number(line.quantity ?? 0),
        unitAmount: Number(line.unit_amount ?? 0),
        totalAmount: Number(line.total_amount ?? 0),
        sortOrder: Number(line.sort_order ?? 0),
        amountRole: line.amount_role,
        insuranceFeeItemId: line.insurance_fee_item_id,
        scheduleCode: line.schedule_code,
        feeItemCode: line.fee_item_code,
        sourceSnapshotHash: line.source_snapshot_hash,
      })),
      warnings: (warningsByEstimateId.get(estimate.id) ?? []).map(warning => ({
        id: warning.id,
        warningCode: warning.warning_code,
        severity: warning.severity,
        message: warning.message,
      })),
    });
  }

  return details;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clinicId = searchParams.get('clinic_id');

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinic_id is required' },
        { status: 400 }
      );
    }

    const period = searchParams.get('period') ?? 'month';
    const dateRange = resolveDateRange(
      period,
      searchParams.get('start_date'),
      searchParams.get('end_date')
    );
    const limit = parseLimit(searchParams.get('limit'));
    const { supabase } = await ensureClinicAccess(request, PATH, clinicId, {
      allowedRoles: Array.from(ADMIN_UI_ROLES),
    });

    const { data: itemRows, error: itemError } = await supabase
      .from('daily_report_items')
      .select(DAILY_REPORT_ITEM_SELECT)
      .eq('clinic_id', clinicId)
      .in('revenue_context_code', Array.from(DETAIL_CONTEXTS))
      .gte('report_date', dateRange.gte)
      .lte('report_date', dateRange.lte)
      .order('report_date', { ascending: false })
      .limit(limit);

    if (itemError) {
      const apiError = normalizeSupabaseError(itemError, PATH);
      return NextResponse.json(
        { error: apiError.message },
        { status: getStatusCodeFromErrorCode(apiError.code) }
      );
    }

    const items = itemRows ?? [];
    const itemIds = items.map(item => item.id);
    if (itemIds.length === 0) {
      return NextResponse.json({ success: true, data: { details: [] } });
    }

    const { data: estimateRows, error: estimateError } = await supabase
      .from('revenue_estimates')
      .select(REVENUE_ESTIMATE_SELECT)
      .eq('clinic_id', clinicId)
      .in('daily_report_item_id', itemIds);

    if (estimateError) {
      const apiError = normalizeSupabaseError(estimateError, PATH);
      return NextResponse.json(
        { error: apiError.message },
        { status: getStatusCodeFromErrorCode(apiError.code) }
      );
    }

    const estimates = estimateRows ?? [];
    const estimateIds = estimates.map(estimate => estimate.id);
    if (estimateIds.length === 0) {
      return NextResponse.json({ success: true, data: { details: [] } });
    }

    const [linesResult, warningsResult] = await Promise.all([
      supabase
        .from('revenue_estimate_lines')
        .select(REVENUE_ESTIMATE_LINE_SELECT)
        .eq('clinic_id', clinicId)
        .in('revenue_estimate_id', estimateIds)
        .order('sort_order', { ascending: true }),
      supabase
        .from('revenue_estimate_warnings')
        .select(REVENUE_ESTIMATE_WARNING_SELECT)
        .eq('clinic_id', clinicId)
        .in('revenue_estimate_id', estimateIds),
    ]);

    if (linesResult.error) {
      const apiError = normalizeSupabaseError(linesResult.error, PATH);
      return NextResponse.json(
        { error: apiError.message },
        { status: getStatusCodeFromErrorCode(apiError.code) }
      );
    }
    if (warningsResult.error) {
      const apiError = normalizeSupabaseError(warningsResult.error, PATH);
      return NextResponse.json(
        { error: apiError.message },
        { status: getStatusCodeFromErrorCode(apiError.code) }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        details: buildDetails(
          items,
          estimates,
          linesResult.data ?? [],
          warningsResult.data ?? []
        ),
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error('Revenue estimate details API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
