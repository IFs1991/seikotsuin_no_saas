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
import {
  CLINIC_ADMIN_ROLES,
  PRICING_TEMPLATE_ADMIN_ROLES,
} from '@/lib/constants/roles';
import { isPatientBurdenRate } from '@/lib/customer-insurance-coverage';
import type { Database } from '@/types/supabase';

const PATH = '/api/menu-templates/[id]/billing-profiles';
const PROFILE_SELECT =
  'id, owner_clinic_id, menu_template_id, revenue_context_code, calculation_method, fixed_amount_yen, default_patient_burden_rate, profession_type, requires_review, effective_from, effective_to, is_active, is_deleted, created_by, updated_by, created_at, updated_at';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ProfileRow =
  Database['public']['Tables']['menu_template_billing_profiles']['Row'];
type ProfileInsert =
  Database['public']['Tables']['menu_template_billing_profiles']['Insert'];

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

const profileCreateSchema = z
  .object({
    owner_clinic_id: z.string().uuid(),
    revenueContextCode: revenueContextSchema,
    calculationMethod: calculationMethodSchema,
    fixedAmountYen: z.number().min(0).nullable().optional(),
    defaultPatientBurdenRate: z
      .number()
      .int()
      .refine(isPatientBurdenRate, '負担割合は0/10/20/30で指定してください')
      .nullable()
      .optional(),
    professionType: z.string().trim().max(80).nullable().optional(),
    requiresReview: z.boolean().default(false),
    effectiveFrom: z.string().regex(DATE_PATTERN),
    effectiveTo: z.string().regex(DATE_PATTERN).nullable().optional(),
    isActive: z.boolean().default(true),
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const parsedTemplateId = z.string().uuid().safeParse(id);
    if (!parsedTemplateId.success) {
      return createErrorResponse('id はUUID形式で指定してください', 400);
    }

    const ownerClinicId = request.nextUrl.searchParams.get('owner_clinic_id');
    if (!ownerClinicId) {
      return createErrorResponse('owner_clinic_id は必須です', 400);
    }

    const auth = await processApiRequest(request, {
      clinicId: ownerClinicId,
      requireClinicMatch: true,
      allowedRoles: Array.from(CLINIC_ADMIN_ROLES),
    });
    if (!auth.success) return auth.error;

    const supabase = createScopedProfileClient(auth.permissions, ownerClinicId);
    const { data, error } = await supabase
      .from('menu_template_billing_profiles')
      .select(PROFILE_SELECT)
      .eq('owner_clinic_id', ownerClinicId)
      .eq('menu_template_id', parsedTemplateId.data)
      .eq('is_deleted', false)
      .order('effective_from', { ascending: false });

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse((data ?? []).map(mapProfileApi));
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const parsedTemplateId = z.string().uuid().safeParse(id);
    if (!parsedTemplateId.success) {
      return createErrorResponse('id はUUID形式で指定してください', 400);
    }

    const result = await processClinicScopedBody(request, profileCreateSchema, {
      allowedRoles: Array.from(PRICING_TEMPLATE_ADMIN_ROLES),
    });
    if (!result.success) return result.error;

    const dto = result.dto;
    const insertPayload: ProfileInsert = {
      owner_clinic_id: dto.owner_clinic_id,
      menu_template_id: parsedTemplateId.data,
      revenue_context_code: dto.revenueContextCode,
      calculation_method: dto.calculationMethod,
      fixed_amount_yen: dto.fixedAmountYen ?? null,
      default_patient_burden_rate: dto.defaultPatientBurdenRate ?? null,
      profession_type: dto.professionType ?? null,
      requires_review: dto.requiresReview,
      effective_from: dto.effectiveFrom,
      effective_to: dto.effectiveTo ?? null,
      is_active: dto.isActive,
      created_by: result.auth.id,
      updated_by: result.auth.id,
    };
    const supabase = createScopedProfileClient(
      result.permissions,
      dto.owner_clinic_id
    );

    const { data, error } = await supabase
      .from('menu_template_billing_profiles')
      .insert(insertPayload)
      .select(PROFILE_SELECT)
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse(mapProfileApi(data), 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
