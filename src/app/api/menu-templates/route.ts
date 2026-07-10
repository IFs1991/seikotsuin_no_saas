import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  processApiRequest,
} from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { CLINIC_ADMIN_ROLES } from '@/lib/constants/roles';
import { ensureBusinessWriteAccess } from '@/lib/billing/business-write';
import { resolveTemplateOwnerScope } from './helpers';
import {
  mapMenuTemplateInsertToRow,
  mapMenuTemplateRowToApi,
  mapMenuTemplateUpdateToRow,
  menuTemplateDeleteQuerySchema,
  menuTemplateInsertSchema,
  menuTemplatesQuerySchema,
  menuTemplateUpdateSchema,
  type MenuTemplateRow,
} from './schema';

const PATH = '/api/menu-templates';
const TEMPLATE_ADMIN_ROLES = Array.from(CLINIC_ADMIN_ROLES);
const TEMPLATE_RESPONSE_COLUMNS =
  'id, owner_clinic_id, name, description, category, price, duration_minutes, is_insurance_applicable, options, is_active, display_order';

function createTemplateScopedClient(
  permissions: Parameters<typeof createScopedAdminContext>[0],
  clinicId: string
) {
  const scopedAdmin = createScopedAdminContext(permissions);
  scopedAdmin.assertClinicInScope(clinicId);
  return scopedAdmin.client;
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = menuTemplatesQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
    });
    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const { clinic_id } = parsedQuery.data;
    const guard = await processApiRequest(request, {
      clinicId: clinic_id,
      requireClinicMatch: true,
      allowedRoles: TEMPLATE_ADMIN_ROLES,
    });
    if (!guard.success) return guard.error;

    const supabase = createTemplateScopedClient(guard.permissions, clinic_id);
    const ownerScope = await resolveTemplateOwnerScope(
      supabase,
      clinic_id,
      PATH
    );
    const { data, error } = await supabase
      .from('menu_templates')
      .select(TEMPLATE_RESPONSE_COLUMNS)
      .eq('owner_clinic_id', ownerScope.ownerClinicId)
      .eq('is_deleted', false)
      .order('display_order', { ascending: true });

    if (error) throw normalizeSupabaseError(error, PATH);

    return createSuccessResponse({
      templates: ((data ?? []) as MenuTemplateRow[]).map(
        mapMenuTemplateRowToApi
      ),
      ownerClinicId: ownerScope.ownerClinicId,
      ownerClinicName: ownerScope.ownerClinicName,
      targetClinicId: ownerScope.targetClinicId,
      isOwnerClinic: ownerScope.isOwnerClinic,
    });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: TEMPLATE_ADMIN_ROLES,
    });
    if (!result.success) return result.error;

    const parsed = menuTemplateInsertSchema.safeParse(result.body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    await ensureBusinessWriteAccess({
      client: result.supabase,
      targetClinicId: parsed.data.owner_clinic_id,
    });

    const supabase = createTemplateScopedClient(
      result.permissions,
      parsed.data.owner_clinic_id
    );

    const insertPayload = mapMenuTemplateInsertToRow(
      parsed.data,
      result.auth.id
    );
    const { data, error } = await supabase
      .from('menu_templates')
      .insert(insertPayload)
      .select(TEMPLATE_RESPONSE_COLUMNS)
      .single();

    if (error) throw normalizeSupabaseError(error, PATH);
    return createSuccessResponse(mapMenuTemplateRowToApi(data), 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const result = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: TEMPLATE_ADMIN_ROLES,
    });
    if (!result.success) return result.error;

    const parsed = menuTemplateUpdateSchema.safeParse(result.body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    await ensureBusinessWriteAccess({
      client: result.supabase,
      targetClinicId: parsed.data.owner_clinic_id,
    });

    const supabase = createTemplateScopedClient(
      result.permissions,
      parsed.data.owner_clinic_id
    );

    const updatePayload = mapMenuTemplateUpdateToRow(parsed.data);
    const { data, error } = await supabase
      .from('menu_templates')
      .update(updatePayload)
      .eq('id', parsed.data.id)
      .eq('owner_clinic_id', parsed.data.owner_clinic_id)
      .eq('is_deleted', false)
      .select(TEMPLATE_RESPONSE_COLUMNS)
      .single();

    if (error) throw normalizeSupabaseError(error, PATH);
    return createSuccessResponse(mapMenuTemplateRowToApi(data));
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const parsedQuery = menuTemplateDeleteQuerySchema.safeParse({
      owner_clinic_id: request.nextUrl.searchParams.get('owner_clinic_id'),
      id: request.nextUrl.searchParams.get('id'),
    });
    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const guard = await processApiRequest(request, {
      clinicId: parsedQuery.data.owner_clinic_id,
      requireClinicMatch: true,
      allowedRoles: TEMPLATE_ADMIN_ROLES,
      requireBusinessWriteAccess: true,
    });
    if (!guard.success) return guard.error;

    const supabase = createTemplateScopedClient(
      guard.permissions,
      parsedQuery.data.owner_clinic_id
    );
    const { data, error } = await supabase
      .from('menu_templates')
      .update({ is_deleted: true })
      .eq('id', parsedQuery.data.id)
      .eq('owner_clinic_id', parsedQuery.data.owner_clinic_id)
      .select('id');

    if (error) throw normalizeSupabaseError(error, PATH);
    if (!data || data.length === 0) {
      return createErrorResponse('テンプレートが見つかりません', 404);
    }

    return createSuccessResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
