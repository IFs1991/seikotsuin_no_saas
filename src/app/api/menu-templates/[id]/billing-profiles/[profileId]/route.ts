import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { PRICING_TEMPLATE_ADMIN_ROLES } from '@/lib/constants/roles';
import { isPatientBurdenRate } from '@/lib/customer-insurance-coverage';
import type { Database } from '@/types/supabase';

const PATH = '/api/menu-templates/[id]/billing-profiles/[profileId]';
const PROFILE_SELECT =
  'id, owner_clinic_id, menu_template_id, revenue_context_code, calculation_method, fixed_amount_yen, default_patient_burden_rate, profession_type, requires_review, effective_from, effective_to, is_active, is_deleted, created_by, updated_by, created_at, updated_at';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ProfileRow =
  Database['public']['Tables']['menu_template_billing_profiles']['Row'];
type ProfileUpdate =
  Database['public']['Tables']['menu_template_billing_profiles']['Update'];

const revenueContextSchema = z.enum([
  'insurance',
  'private',
  'traffic_accident',
  'workers_comp',
  'product',
  'ticket',
  'other',
]);

const calculationMethodSchema = z.enum([
  'fixed_amount',
  'insurance_master',
  'manual_estimate',
]);

const profileUpdateSchema = z
  .object({
    owner_clinic_id: z.string().uuid(),
    revenueContextCode: revenueContextSchema.optional(),
    calculationMethod: calculationMethodSchema.optional(),
    fixedAmountYen: z.number().min(0).nullable().optional(),
    defaultPatientBurdenRate: z
      .number()
      .int()
      .refine(isPatientBurdenRate, '負担割合は0/10/20/30で指定してください')
      .nullable()
      .optional(),
    professionType: z.string().trim().max(80).nullable().optional(),
    requiresReview: z.boolean().optional(),
    effectiveFrom: z.string().regex(DATE_PATTERN).optional(),
    effectiveTo: z.string().regex(DATE_PATTERN).nullable().optional(),
    isActive: z.boolean().optional(),
    isDeleted: z.boolean().optional(),
  })
  .strict();

function createScopedProfileClient(
  permissions: Parameters<typeof createScopedAdminContext>[0],
  clinicId: string
) {
  const scopedAdmin = createScopedAdminContext(permissions);
  scopedAdmin.assertClinicInScope(clinicId);
  return scopedAdmin.client;
}

function mapProfileApi(row: ProfileRow) {
  return {
    id: row.id,
    ownerClinicId: row.owner_clinic_id,
    menuTemplateId: row.menu_template_id,
    revenueContextCode: row.revenue_context_code,
    calculationMethod: row.calculation_method,
    fixedAmountYen:
      row.fixed_amount_yen === null ? null : Number(row.fixed_amount_yen),
    defaultPatientBurdenRate: row.default_patient_burden_rate,
    professionType: row.profession_type,
    requiresReview: row.requires_review,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    isActive: row.is_active,
    isDeleted: row.is_deleted,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; profileId: string }> }
) {
  const { id, profileId } = await context.params;

  try {
    const parsedTemplateId = z.string().uuid().safeParse(id);
    const parsedProfileId = z.string().uuid().safeParse(profileId);
    if (!parsedTemplateId.success || !parsedProfileId.success) {
      return createErrorResponse('id はUUID形式で指定してください', 400);
    }

    const result = await processClinicScopedBody(request, profileUpdateSchema, {
      allowedRoles: Array.from(PRICING_TEMPLATE_ADMIN_ROLES),
    });
    if (!result.success) return result.error;

    const dto = result.dto;
    const updatePayload: ProfileUpdate = {
      updated_by: result.auth.id,
    };

    if (dto.revenueContextCode !== undefined) {
      updatePayload.revenue_context_code = dto.revenueContextCode;
    }
    if (dto.calculationMethod !== undefined) {
      updatePayload.calculation_method = dto.calculationMethod;
    }
    if (dto.fixedAmountYen !== undefined) {
      updatePayload.fixed_amount_yen = dto.fixedAmountYen;
    }
    if (dto.defaultPatientBurdenRate !== undefined) {
      updatePayload.default_patient_burden_rate = dto.defaultPatientBurdenRate;
    }
    if (dto.professionType !== undefined) {
      updatePayload.profession_type = dto.professionType;
    }
    if (dto.requiresReview !== undefined) {
      updatePayload.requires_review = dto.requiresReview;
    }
    if (dto.effectiveFrom !== undefined) {
      updatePayload.effective_from = dto.effectiveFrom;
    }
    if (dto.effectiveTo !== undefined) {
      updatePayload.effective_to = dto.effectiveTo;
    }
    if (dto.isActive !== undefined) {
      updatePayload.is_active = dto.isActive;
    }
    if (dto.isDeleted !== undefined) {
      updatePayload.is_deleted = dto.isDeleted;
    }

    const supabase = createScopedProfileClient(
      result.permissions,
      dto.owner_clinic_id
    );
    const { data, error } = await supabase
      .from('menu_template_billing_profiles')
      .update(updatePayload)
      .eq('owner_clinic_id', dto.owner_clinic_id)
      .eq('menu_template_id', parsedTemplateId.data)
      .eq('id', parsedProfileId.data)
      .select(PROFILE_SELECT)
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse(mapProfileApi(data));
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
