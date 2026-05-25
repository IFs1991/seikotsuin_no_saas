import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { CLINIC_PRICING_ADMIN_ROLES } from '@/lib/constants/roles';
import { isPatientBurdenRate } from '@/lib/customer-insurance-coverage';
import type { Database } from '@/types/supabase';

const PATH = '/api/customers/[customerId]/insurance-coverages/[coverageId]';
const COVERAGE_SELECT =
  'id, clinic_id, customer_id, payer_context_code, patient_burden_rate, effective_from, effective_to, verification_status, verified_at, verified_by, notes, created_by, updated_by, created_at, updated_at';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type CoverageRow =
  Database['public']['Tables']['customer_insurance_coverages']['Row'];
type CoverageUpdate =
  Database['public']['Tables']['customer_insurance_coverages']['Update'];

const coverageUpdateSchema = z
  .object({
    clinic_id: z.string().uuid(),
    patientBurdenRate: z
      .number()
      .int()
      .refine(isPatientBurdenRate, '負担割合は0/10/20/30で指定してください')
      .optional(),
    effectiveFrom: z.string().regex(DATE_PATTERN).optional(),
    effectiveTo: z.string().regex(DATE_PATTERN).nullable().optional(),
    verificationStatus: z
      .enum(['confirmed', 'needs_review', 'expired', 'inactive'])
      .optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

function createScopedCoverageClient(
  permissions: Parameters<typeof createScopedAdminContext>[0],
  clinicId: string
) {
  const scopedAdmin = createScopedAdminContext(permissions);
  scopedAdmin.assertClinicInScope(clinicId);
  return scopedAdmin.client;
}

function mapCoverageApi(row: CoverageRow) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    customerId: row.customer_id,
    payerContextCode: row.payer_context_code,
    patientBurdenRate: Number(row.patient_burden_rate),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ customerId: string; coverageId: string }> }
) {
  const { customerId, coverageId } = await context.params;

  try {
    const parsedCustomerId = z.string().uuid().safeParse(customerId);
    const parsedCoverageId = z.string().uuid().safeParse(coverageId);
    if (!parsedCustomerId.success || !parsedCoverageId.success) {
      return createErrorResponse('id はUUID形式で指定してください', 400);
    }

    const result = await processClinicScopedBody(
      request,
      coverageUpdateSchema,
      {
        allowedRoles: Array.from(CLINIC_PRICING_ADMIN_ROLES),
      }
    );
    if (!result.success) return result.error;

    const dto = result.dto;
    const supabase = createScopedCoverageClient(
      result.permissions,
      dto.clinic_id
    );
    const updatePayload: CoverageUpdate = {
      updated_by: result.auth.id,
    };

    if (dto.patientBurdenRate !== undefined) {
      updatePayload.patient_burden_rate = dto.patientBurdenRate;
    }
    if (dto.effectiveFrom !== undefined) {
      updatePayload.effective_from = dto.effectiveFrom;
    }
    if (dto.effectiveTo !== undefined) {
      updatePayload.effective_to = dto.effectiveTo;
    }
    if (dto.verificationStatus !== undefined) {
      updatePayload.verification_status = dto.verificationStatus;
      if (dto.verificationStatus === 'confirmed') {
        updatePayload.verified_at = new Date().toISOString();
        updatePayload.verified_by = result.auth.id;
      }
    }
    if (dto.notes !== undefined) {
      updatePayload.notes = dto.notes;
    }

    const { data, error } = await supabase
      .from('customer_insurance_coverages')
      .update(updatePayload)
      .eq('clinic_id', dto.clinic_id)
      .eq('customer_id', parsedCustomerId.data)
      .eq('id', parsedCoverageId.data)
      .select(COVERAGE_SELECT)
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse(mapCoverageApi(data));
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
