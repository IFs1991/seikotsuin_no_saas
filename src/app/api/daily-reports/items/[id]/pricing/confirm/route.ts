import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { STAFF_ROLES } from '@/lib/constants/roles';
import { isPatientBurdenRate } from '@/lib/customer-insurance-coverage';
import type { Database } from '@/types/supabase';

const PATH = '/api/daily-reports/items/[id]/pricing/confirm';

type PricingConfirmResult =
  Database['public']['Functions']['confirm_daily_report_item_pricing']['Returns'][number];
type PricingConfirmArgs =
  Database['public']['Functions']['confirm_daily_report_item_pricing']['Args'];

const pricingConfirmSchema = z
  .object({
    clinic_id: z.string().uuid(),
    patientBurdenRateOverride: z
      .number()
      .int()
      .refine(isPatientBurdenRate, '負担割合は0/10/20/30で指定してください')
      .nullable()
      .optional(),
    manualEstimatedAmount: z.number().min(0).nullable().optional(),
    updateCustomerCoverage: z.boolean().default(false),
    confirmationNote: z.string().max(2000).nullable().optional(),
  })
  .strict();

function createScopedPricingClient(
  permissions: Parameters<typeof createScopedAdminContext>[0],
  clinicId: string
) {
  const scopedAdmin = createScopedAdminContext(permissions);
  scopedAdmin.assertClinicInScope(clinicId);
  return scopedAdmin.client;
}

function mapPricingConfirmResult(row: PricingConfirmResult) {
  return {
    dailyReportItemId: row.daily_report_item_id,
    revenueEstimateId: row.revenue_estimate_id,
    estimateStatus: row.estimate_status,
    estimatedTotal: Number(row.estimated_total ?? 0),
    pricingSnapshotStatus: row.pricing_snapshot_status,
    patientBurdenRate: row.patient_burden_rate,
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const parsedItemId = z.string().uuid().safeParse(id);
    if (!parsedItemId.success) {
      return createErrorResponse('id はUUID形式で指定してください', 400);
    }

    const result = await processClinicScopedBody(
      request,
      pricingConfirmSchema,
      {
        allowedRoles: Array.from(STAFF_ROLES),
      }
    );
    if (!result.success) return result.error;

    const dto = result.dto;
    const supabase = createScopedPricingClient(
      result.permissions,
      dto.clinic_id
    );

    const rpcArgs: PricingConfirmArgs = {
      p_clinic_id: dto.clinic_id,
      p_daily_report_item_id: parsedItemId.data,
      p_update_customer_coverage: dto.updateCustomerCoverage ?? false,
      p_actor_user_id: result.auth.id,
    };
    if (dto.patientBurdenRateOverride != null) {
      rpcArgs.p_patient_burden_rate_override = dto.patientBurdenRateOverride;
    }
    if (dto.manualEstimatedAmount != null) {
      rpcArgs.p_manual_estimated_amount = dto.manualEstimatedAmount;
    }
    if (dto.confirmationNote != null) {
      rpcArgs.p_confirmation_note = dto.confirmationNote;
    }

    const { data, error } = await supabase.rpc(
      'confirm_daily_report_item_pricing',
      rpcArgs
    );

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    const firstRow = data?.[0];
    if (!firstRow) {
      return createErrorResponse('金額確定結果が取得できませんでした', 500);
    }

    return createSuccessResponse(mapPricingConfirmResult(firstRow));
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
