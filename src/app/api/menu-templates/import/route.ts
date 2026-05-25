import { NextRequest } from 'next/server';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { CLINIC_ADMIN_ROLES } from '@/lib/constants/roles';
import { mapMenuRowToApi, type MenuRow } from '@/app/api/menus/schema';
import { resolveTemplateOwnerScope } from '../helpers';
import {
  mapTemplateToMenuInsertRow,
  menuTemplateImportSchema,
  type MenuTemplateRow,
} from '../schema';
import type { Database } from '@/types/supabase';

const PATH = '/api/menu-templates/import';
const TEMPLATE_ADMIN_ROLES = Array.from(CLINIC_ADMIN_ROLES);
const TEMPLATE_IMPORT_COLUMNS =
  'id, owner_clinic_id, name, description, category, price, duration_minutes, is_insurance_applicable, options, is_active, display_order';
const MENU_RESPONSE_COLUMNS =
  'id, clinic_id, name, duration_minutes, price, description, category, is_insurance_applicable, is_active, options';
const TEMPLATE_PROFILE_IMPORT_COLUMNS =
  'id, owner_clinic_id, menu_template_id, revenue_context_code, calculation_method, fixed_amount_yen, default_patient_burden_rate, profession_type, requires_review, effective_from, effective_to, is_active, is_deleted';

type TemplateProfileImportRow = Pick<
  Database['public']['Tables']['menu_template_billing_profiles']['Row'],
  | 'id'
  | 'revenue_context_code'
  | 'calculation_method'
  | 'fixed_amount_yen'
  | 'default_patient_burden_rate'
  | 'profession_type'
  | 'requires_review'
  | 'effective_from'
  | 'effective_to'
  | 'is_active'
  | 'is_deleted'
>;
type MenuBillingProfileInsert =
  Database['public']['Tables']['menu_billing_profiles']['Insert'];

function mapTemplateProfileToMenuProfileInsert(
  profile: TemplateProfileImportRow,
  params: {
    clinicId: string;
    menuId: string;
    userId: string;
  }
): MenuBillingProfileInsert {
  return {
    clinic_id: params.clinicId,
    menu_id: params.menuId,
    source_template_profile_id: profile.id,
    revenue_context_code: profile.revenue_context_code,
    calculation_method: profile.calculation_method,
    fixed_amount_yen: profile.fixed_amount_yen,
    default_patient_burden_rate: profile.default_patient_burden_rate,
    profession_type: profile.profession_type,
    requires_review: profile.requires_review,
    effective_from: profile.effective_from,
    effective_to: profile.effective_to,
    is_active: profile.is_active,
    is_deleted: profile.is_deleted,
    created_by: params.userId,
    updated_by: params.userId,
  };
}

export async function POST(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(
      request,
      menuTemplateImportSchema,
      {
        allowedRoles: TEMPLATE_ADMIN_ROLES,
      }
    );
    if (!result.success) return result.error;

    const dto = result.dto;
    const scopedAdmin = createScopedAdminContext(result.permissions);
    scopedAdmin.assertClinicInScope(dto.clinic_id);
    const supabase = scopedAdmin.client;
    const ownerScope = await resolveTemplateOwnerScope(
      supabase,
      dto.clinic_id,
      PATH
    );
    const { data: template, error: templateError } = await supabase
      .from('menu_templates')
      .select(TEMPLATE_IMPORT_COLUMNS)
      .eq('id', dto.template_id)
      .eq('owner_clinic_id', ownerScope.ownerClinicId)
      .eq('is_deleted', false)
      .eq('is_active', true)
      .single();

    if (templateError) throw normalizeSupabaseError(templateError, PATH);
    if (!template) {
      return createErrorResponse('テンプレートが見つかりません', 404);
    }

    const insertPayload = mapTemplateToMenuInsertRow(
      template as MenuTemplateRow,
      dto.clinic_id,
      result.auth.id
    );
    const { data, error } = await supabase
      .from('menus')
      .insert(insertPayload)
      .select(MENU_RESPONSE_COLUMNS)
      .single();

    if (error) throw normalizeSupabaseError(error, PATH);

    const { data: templateProfiles, error: templateProfilesError } =
      await supabase
        .from('menu_template_billing_profiles')
        .select(TEMPLATE_PROFILE_IMPORT_COLUMNS)
        .eq('owner_clinic_id', ownerScope.ownerClinicId)
        .eq('menu_template_id', dto.template_id)
        .eq('is_active', true)
        .eq('is_deleted', false);

    if (templateProfilesError) {
      throw normalizeSupabaseError(templateProfilesError, PATH);
    }

    const profileRows: TemplateProfileImportRow[] = templateProfiles ?? [];
    if (profileRows.length > 0) {
      const profilePayloads = profileRows.map(profile =>
        mapTemplateProfileToMenuProfileInsert(profile, {
          clinicId: dto.clinic_id,
          menuId: data.id,
          userId: result.auth.id,
        })
      );
      const { error: profileCopyError } = await supabase
        .from('menu_billing_profiles')
        .insert(profilePayloads);

      if (profileCopyError) {
        throw normalizeSupabaseError(profileCopyError, PATH);
      }
    }

    return createSuccessResponse(mapMenuRowToApi(data as MenuRow), 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
