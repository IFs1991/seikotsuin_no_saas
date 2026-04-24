import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  processApiRequest,
} from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError } from '@/lib/route-helpers';
import { canAccessClinicScope } from '@/lib/supabase';
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

export async function POST(request: NextRequest) {
  try {
    const result = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: TEMPLATE_ADMIN_ROLES,
    });
    if (!result.success) return result.error;

    const parsed = menuTemplateImportSchema.safeParse(result.body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    if (!canAccessClinicScope(result.permissions, parsed.data.clinic_id)) {
      return createErrorResponse(
        'このクリニックへのアクセス権がありません',
        403
      );
    }

    const supabase = result.supabase as any;
    const ownerScope = await resolveTemplateOwnerScope(
      supabase,
      parsed.data.clinic_id,
      PATH
    );
    const { data: template, error: templateError } = await supabase
      .from('menu_templates')
      .select('*')
      .eq('id', parsed.data.template_id)
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
      parsed.data.clinic_id,
      result.auth.id
    );
    const { data, error } = await supabase
      .from('menus')
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw normalizeSupabaseError(error, PATH);
    return createSuccessResponse(mapMenuRowToApi(data as MenuRow), 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
