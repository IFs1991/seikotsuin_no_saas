import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createSuccessResponse } from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { STAFF_ROLES } from '@/lib/constants/roles';
import {
  calculateRevenueEstimate,
  REVENUE_ESTIMATE_DISCLAIMER,
} from '@/lib/revenue-estimate';
import {
  isSelectableRevenueContextCode,
  type RevenueContextCode,
} from '@/lib/revenue-context';
import type { Database } from '@/types/supabase';

const PATH = '/api/revenue-estimates/recalculate';
const DAILY_REPORT_ITEM_SELECT =
  'id, clinic_id, report_date, fee, revenue_context_code, visit_stage_code, estimate_status';
const REVENUE_ESTIMATE_SELECT =
  'id, clinic_id, daily_report_item_id, estimate_status';
const UPSERTED_REVENUE_ESTIMATE_SELECT = 'id, daily_report_item_id';

type DailyReportItemEstimateRow = Pick<
  Database['public']['Tables']['daily_report_items']['Row'],
  | 'id'
  | 'clinic_id'
  | 'report_date'
  | 'fee'
  | 'revenue_context_code'
  | 'visit_stage_code'
  | 'estimate_status'
>;
type RevenueEstimateRow = Pick<
  Database['public']['Tables']['revenue_estimates']['Row'],
  'id' | 'clinic_id' | 'daily_report_item_id' | 'estimate_status'
>;
type UpsertedRevenueEstimateRow = Pick<
  Database['public']['Tables']['revenue_estimates']['Row'],
  'id' | 'daily_report_item_id'
>;
type RevenueEstimateInsert =
  Database['public']['Tables']['revenue_estimates']['Insert'];
type RevenueEstimateLineInsert =
  Database['public']['Tables']['revenue_estimate_lines']['Insert'];
type RevenueEstimateWarningInsert =
  Database['public']['Tables']['revenue_estimate_warnings']['Insert'];
type DailyReportItemUpdate =
  Database['public']['Tables']['daily_report_items']['Update'];
type EstimateStatus =
  Database['public']['Tables']['daily_report_items']['Update']['estimate_status'];
type RevenueEstimateJob = {
  item: DailyReportItemEstimateRow;
  revenueContextCode: RevenueContextCode;
  calculation: ReturnType<typeof calculateRevenueEstimate>;
};

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付はYYYY-MM-DD形式で指定してください');

const recalculateSchema = z
  .object({
    clinic_id: z.string().uuid(),
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    dailyReportItemId: z.string().uuid().optional(),
  })
  .strict();

function createScopedRevenueEstimateClient(
  permissions: Parameters<typeof createScopedAdminContext>[0],
  clinicId: string
) {
  const scopedAdmin = createScopedAdminContext(permissions);
  scopedAdmin.assertClinicInScope(clinicId);
  return scopedAdmin.client;
}

function normalizeEstimateContext(value: string): RevenueContextCode {
  return isSelectableRevenueContextCode(value) ? value : 'other';
}

function buildExistingEstimateMap(estimates: RevenueEstimateRow[]) {
  return new Map(
    estimates.map(estimate => [estimate.daily_report_item_id, estimate])
  );
}

function buildUpsertedEstimateMap(estimates: UpsertedRevenueEstimateRow[]) {
  return new Map(
    estimates.map(estimate => [estimate.daily_report_item_id, estimate.id])
  );
}

function groupItemIdsByEstimateStatus(jobs: RevenueEstimateJob[]) {
  const grouped = new Map<NonNullable<EstimateStatus>, string[]>();

  for (const job of jobs) {
    const status = job.calculation.estimateStatus;
    const existing = grouped.get(status) ?? [];
    existing.push(job.item.id);
    grouped.set(status, existing);
  }

  return grouped;
}

export async function POST(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(request, recalculateSchema, {
      allowedRoles: Array.from(STAFF_ROLES),
    });
    if (!result.success) return result.error;

    const dto = result.dto;
    const supabase = createScopedRevenueEstimateClient(
      result.permissions,
      dto.clinic_id
    );

    let itemsQuery = supabase
      .from('daily_report_items')
      .select(DAILY_REPORT_ITEM_SELECT)
      .eq('clinic_id', dto.clinic_id);

    if (dto.dailyReportItemId) {
      itemsQuery = itemsQuery.eq('id', dto.dailyReportItemId);
    }
    if (dto.startDate) {
      itemsQuery = itemsQuery.gte('report_date', dto.startDate);
    }
    if (dto.endDate) {
      itemsQuery = itemsQuery.lte('report_date', dto.endDate);
    }

    const { data: items, error: itemsError } = await itemsQuery;
    if (itemsError) {
      throw normalizeSupabaseError(itemsError, PATH);
    }

    const itemRows: DailyReportItemEstimateRow[] = items ?? [];
    const itemIds = itemRows.map(item => item.id);

    if (itemIds.length === 0) {
      return createSuccessResponse({
        processedItemCount: 0,
        calculatedCount: 0,
        needsReviewCount: 0,
        skippedOverriddenCount: 0,
        disclaimer: REVENUE_ESTIMATE_DISCLAIMER,
      });
    }

    const { data: existingEstimates, error: estimatesError } = await supabase
      .from('revenue_estimates')
      .select(REVENUE_ESTIMATE_SELECT)
      .eq('clinic_id', dto.clinic_id)
      .in('daily_report_item_id', itemIds);

    if (estimatesError) {
      throw normalizeSupabaseError(estimatesError, PATH);
    }

    const existingEstimateByItemId = buildExistingEstimateMap(
      existingEstimates ?? []
    );
    let calculatedCount = 0;
    let needsReviewCount = 0;
    let skippedOverriddenCount = 0;
    const jobs: RevenueEstimateJob[] = [];

    for (const item of itemRows) {
      const existingEstimate = existingEstimateByItemId.get(item.id);
      if (
        existingEstimate?.estimate_status === 'overridden' ||
        item.estimate_status === 'overridden'
      ) {
        skippedOverriddenCount += 1;
        continue;
      }

      const revenueContextCode = normalizeEstimateContext(
        item.revenue_context_code
      );
      const calculation = calculateRevenueEstimate({
        revenueContextCode,
        fee: Number(item.fee ?? 0),
        visitStageCode: item.visit_stage_code,
      });

      jobs.push({
        item,
        revenueContextCode,
        calculation,
      });

      if (calculation.estimateStatus === 'calculated') {
        calculatedCount += 1;
      }
      if (calculation.estimateStatus === 'needs_review') {
        needsReviewCount += 1;
      }
    }

    if (jobs.length === 0) {
      return createSuccessResponse({
        processedItemCount: itemRows.length,
        calculatedCount,
        needsReviewCount,
        skippedOverriddenCount,
        disclaimer: REVENUE_ESTIMATE_DISCLAIMER,
      });
    }

    const calculatedAt = new Date().toISOString();
    const estimatePayloads: RevenueEstimateInsert[] = jobs.map(job => ({
      clinic_id: dto.clinic_id,
      daily_report_item_id: job.item.id,
      revenue_context_code: job.revenueContextCode,
      estimate_status: job.calculation.estimateStatus,
      estimated_total: job.calculation.estimatedTotal,
      disclaimer: REVENUE_ESTIMATE_DISCLAIMER,
      calculated_at: calculatedAt,
      calculation_version: 'v1',
      created_by: result.auth.id,
      updated_by: result.auth.id,
    }));

    const { data: upsertedEstimates, error: upsertError } = await supabase
      .from('revenue_estimates')
      .upsert(estimatePayloads, { onConflict: 'daily_report_item_id' })
      .select(UPSERTED_REVENUE_ESTIMATE_SELECT);

    if (upsertError) {
      throw normalizeSupabaseError(upsertError, PATH);
    }

    const estimateIdByItemId = buildUpsertedEstimateMap(
      upsertedEstimates ?? []
    );
    const estimateIds = Array.from(estimateIdByItemId.values());
    const missingEstimateItem = jobs.find(
      job => !estimateIdByItemId.has(job.item.id)
    );
    if (missingEstimateItem) {
      throw new Error('Failed to resolve revenue estimate ids');
    }

    if (estimateIds.length > 0) {
      const [deleteLinesResult, deleteWarningsResult] = await Promise.all([
        supabase
          .from('revenue_estimate_lines')
          .delete()
          .eq('clinic_id', dto.clinic_id)
          .in('revenue_estimate_id', estimateIds),
        supabase
          .from('revenue_estimate_warnings')
          .delete()
          .eq('clinic_id', dto.clinic_id)
          .in('revenue_estimate_id', estimateIds),
      ]);

      if (deleteLinesResult.error) {
        throw normalizeSupabaseError(deleteLinesResult.error, PATH);
      }
      if (deleteWarningsResult.error) {
        throw normalizeSupabaseError(deleteWarningsResult.error, PATH);
      }
    }

    const linePayloads: RevenueEstimateLineInsert[] = [];
    const warningPayloads: RevenueEstimateWarningInsert[] = [];

    for (const job of jobs) {
      const estimateId = estimateIdByItemId.get(job.item.id);
      if (!estimateId) {
        throw new Error('Failed to resolve revenue estimate ids');
      }

      linePayloads.push(
        ...job.calculation.lines.map(line => ({
          clinic_id: dto.clinic_id,
          revenue_estimate_id: estimateId,
          line_type: line.lineType,
          label: line.label,
          quantity: line.quantity,
          unit_amount: line.unitAmount,
          total_amount: line.totalAmount,
          sort_order: line.sortOrder,
        }))
      );

      warningPayloads.push(
        ...job.calculation.warnings.map(warning => ({
          clinic_id: dto.clinic_id,
          revenue_estimate_id: estimateId,
          warning_code: warning.warningCode,
          severity: warning.severity,
          message: warning.message,
        }))
      );
    }

    if (linePayloads.length > 0) {
      const { error: linesError } = await supabase
        .from('revenue_estimate_lines')
        .insert(linePayloads);
      if (linesError) {
        throw normalizeSupabaseError(linesError, PATH);
      }
    }

    if (warningPayloads.length > 0) {
      const { error: warningsError } = await supabase
        .from('revenue_estimate_warnings')
        .insert(warningPayloads);
      if (warningsError) {
        throw normalizeSupabaseError(warningsError, PATH);
      }
    }

    for (const [estimateStatus, statusItemIds] of groupItemIdsByEstimateStatus(
      jobs
    )) {
      const itemUpdate: DailyReportItemUpdate = {
        estimate_status: estimateStatus,
        amount_source: 'estimate',
        updated_by: result.auth.id,
      };

      const { error: itemUpdateError } = await supabase
        .from('daily_report_items')
        .update(itemUpdate)
        .eq('clinic_id', dto.clinic_id)
        .in('id', statusItemIds);

      if (itemUpdateError) {
        throw normalizeSupabaseError(itemUpdateError, PATH);
      }
    }

    return createSuccessResponse({
      processedItemCount: itemRows.length,
      calculatedCount,
      needsReviewCount,
      skippedOverriddenCount,
      disclaimer: REVENUE_ESTIMATE_DISCLAIMER,
    });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
