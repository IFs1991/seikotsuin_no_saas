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

const PATH = '/api/menu-templates/import';
const TEMPLATE_ADMIN_ROLES = Array.from(CLINIC_ADMIN_ROLES);
const TEMPLATE_IMPORT_COLUMNS =
  'id, owner_clinic_id, name, description, category, price, duration_minutes, is_insurance_applicable, options, is_active, display_order';
const MENU_RESPONSE_COLUMNS =
  'id, clinic_id, name, duration_minutes, price, description, category, is_insurance_applicable, is_active, options';

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
    return createSuccessResponse(mapMenuRowToApi(data as MenuRow), 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
