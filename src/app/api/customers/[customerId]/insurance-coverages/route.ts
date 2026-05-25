import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  processApiRequest,
} from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { CLINIC_PRICING_ADMIN_ROLES, STAFF_ROLES } from '@/lib/constants/roles';
import {
  isCoverageVerificationStatus,
  isPatientBurdenRate,
  resolveCurrentCustomerInsuranceCoverage,
  type CustomerInsuranceCoverageRecord,
} from '@/lib/customer-insurance-coverage';
import type { Database } from '@/types/supabase';

const PATH = '/api/customers/[customerId]/insurance-coverages';
const COVERAGE_SELECT =
  'id, clinic_id, customer_id, payer_context_code, patient_burden_rate, effective_from, effective_to, verification_status, verified_at, verified_by, notes, created_by, updated_by, created_at, updated_at';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type CoverageRow =
  Database['public']['Tables']['customer_insurance_coverages']['Row'];
type CoverageInsert =
  Database['public']['Tables']['customer_insurance_coverages']['Insert'];

const coverageCreateSchema = z
  .object({
    clinic_id: z.string().uuid(),
    patientBurdenRate: z
      .number()
      .int()
      .refine(isPatientBurdenRate, '負担割合は0/10/20/30で指定してください'),
    effectiveFrom: z.string().regex(DATE_PATTERN),
    effectiveTo: z.string().regex(DATE_PATTERN).nullable().optional(),
    verificationStatus: z
      .enum(['confirmed', 'needs_review', 'expired', 'inactive'])
      .default('confirmed'),
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

function mapCoverageRecord(row: CoverageRow): CustomerInsuranceCoverageRecord {
  const rate = Number(row.patient_burden_rate);
  if (!isPatientBurdenRate(rate)) {
    throw new Error('Invalid patient burden rate');
  }
  if (!isCoverageVerificationStatus(row.verification_status)) {
    throw new Error('Invalid coverage verification status');
  }

  return {
    id: row.id,
    clinicId: row.clinic_id,
    customerId: row.customer_id,
    patientBurdenRate: rate,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at,
  };
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await context.params;

  try {
    const parsedCustomerId = z.string().uuid().safeParse(customerId);
    if (!parsedCustomerId.success) {
      return createErrorResponse(
        'customerId はUUID形式で指定してください',
        400
      );
    }

    const clinicId = request.nextUrl.searchParams.get('clinic_id');
    const treatmentDate =
      request.nextUrl.searchParams.get('date') ??
      new Date().toISOString().slice(0, 10);

    if (!clinicId) {
      return createErrorResponse('clinic_id は必須です', 400);
    }
    if (!DATE_PATTERN.test(treatmentDate)) {
      return createErrorResponse(
        'date はYYYY-MM-DD形式で指定してください',
        400
      );
    }

    const auth = await processApiRequest(request, {
      clinicId,
      requireClinicMatch: true,
      allowedRoles: Array.from(STAFF_ROLES),
    });
    if (!auth.success) return auth.error;

    const supabase = createScopedCoverageClient(auth.permissions, clinicId);
    const { data, error } = await supabase
      .from('customer_insurance_coverages')
      .select(COVERAGE_SELECT)
      .eq('clinic_id', clinicId)
      .eq('customer_id', parsedCustomerId.data)
      .order('effective_from', { ascending: false });

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    const rows = data ?? [];
    const resolution = resolveCurrentCustomerInsuranceCoverage(
      rows.map(mapCoverageRecord),
      treatmentDate
    );

    const currentRow =
      resolution.status === 'resolved'
        ? rows.find(row => row.id === resolution.coverage.id)
        : null;

    return createSuccessResponse({
      current: currentRow ? mapCoverageApi(currentRow) : null,
      requiresReview: resolution.status === 'needs_review',
      reviewMessage:
        resolution.status === 'needs_review' ? resolution.message : null,
      previous: rows.map(mapCoverageApi),
    });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await context.params;

  try {
    const parsedCustomerId = z.string().uuid().safeParse(customerId);
    if (!parsedCustomerId.success) {
      return createErrorResponse(
        'customerId はUUID形式で指定してください',
        400
      );
    }

    const result = await processClinicScopedBody(
      request,
      coverageCreateSchema,
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
    const now = new Date().toISOString();
    const insertPayload: CoverageInsert = {
      clinic_id: dto.clinic_id,
      customer_id: parsedCustomerId.data,
      payer_context_code: 'insurance',
      patient_burden_rate: dto.patientBurdenRate,
      effective_from: dto.effectiveFrom,
      effective_to: dto.effectiveTo ?? null,
      verification_status: dto.verificationStatus,
      verified_at: dto.verificationStatus === 'confirmed' ? now : null,
      verified_by:
        dto.verificationStatus === 'confirmed' ? result.auth.id : null,
      notes: dto.notes ?? null,
      created_by: result.auth.id,
      updated_by: result.auth.id,
    };

    const { data, error } = await supabase
      .from('customer_insurance_coverages')
      .insert(insertPayload)
      .select(COVERAGE_SELECT)
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse(mapCoverageApi(data), 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
