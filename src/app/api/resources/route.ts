import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  processApiRequest,
} from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import {
  resourcesQuerySchema,
  resourceInsertSchema,
  resourceUpdateSchema,
  mapResourceInsertToRow,
  mapResourceUpdateToRow,
} from './schema';
import type { Json } from '@/types/supabase';

const PATH = '/api/resources';
const RESOURCE_LIST_SELECT =
  'id, name, type, working_hours, supported_menus, max_concurrent, is_active, display_order';

type ResourceListRow = {
  id: string;
  name: string;
  type: string;
  working_hours: Json | null;
  supported_menus: string[] | null;
  max_concurrent: number | null;
  is_active: boolean | null;
};
type StaffResourceCandidateRow = {
  id: string;
  name: string;
  role: string;
  is_therapist: boolean | null;
};

const STAFF_RESOURCE_FALLBACK_ROLES = new Set([
  'clinic_admin',
  'clinic_manager',
  'manager',
  'practitioner',
  'therapist',
]);

function isJsonRecord(
  value: Json | null
): value is Record<string, Json | undefined> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapResourceListRow(row: ResourceListRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    workingHours: isJsonRecord(row.working_hours) ? row.working_hours : {},
    supportedMenus: row.supported_menus ?? [],
    maxConcurrent: row.max_concurrent ?? 1,
    isActive: row.is_active !== false,
  };
}

function shouldExposeStaffCandidate(row: StaffResourceCandidateRow) {
  return (
    row.is_therapist === true || STAFF_RESOURCE_FALLBACK_ROLES.has(row.role)
  );
}

function mapStaffCandidateToResource(row: StaffResourceCandidateRow) {
  return {
    id: row.id,
    name: row.name,
    type: 'staff',
    workingHours: {},
    supportedMenus: [],
    maxConcurrent: 1,
    isActive: true,
  };
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = resourcesQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      type: request.nextUrl.searchParams.get('type') ?? undefined,
    });
    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }
    const { clinic_id, type } = parsedQuery.data;
    const guard = await processApiRequest(request, {
      clinicId: clinic_id,
      requireClinicMatch: true,
    });
    if (!guard.success) return guard.error;

    let query = guard.supabase
      .from('resources')
      .select(RESOURCE_LIST_SELECT)
      .eq('clinic_id', clinic_id)
      .eq('is_deleted', false);
    if (type) query = query.eq('type', type);
    const { data, error } = await query.order('display_order', {
      ascending: true,
    });
    if (error) throw normalizeSupabaseError(error, PATH);

    let mapped = (data ?? []).map(mapResourceListRow);

    const shouldLoadStaffFallback =
      (type === undefined || type === 'staff') &&
      !mapped.some(resource => resource.type === 'staff' && resource.isActive);

    if (shouldLoadStaffFallback) {
      const { data: staffData, error: staffError } = await guard.supabase
        .from('staff')
        .select('id, name, role, is_therapist')
        .eq('clinic_id', clinic_id);

      if (staffError) throw normalizeSupabaseError(staffError, PATH);

      const existingResourceIds = new Set(mapped.map(resource => resource.id));
      const staffFallbackResources = (staffData ?? [])
        .filter(row => !existingResourceIds.has(row.id))
        .filter(shouldExposeStaffCandidate)
        .map(mapStaffCandidateToResource);

      mapped = [...mapped, ...staffFallbackResources];
    }

    return createSuccessResponse(mapped);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(request, resourceInsertSchema);
    if (!result.success) return result.error;

    const insertPayload = mapResourceInsertToRow(result.dto, result.auth.id);
    const { data, error } = await result.supabase
      .from('resources')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw normalizeSupabaseError(error, PATH);
    return createSuccessResponse(data, 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(request, resourceUpdateSchema);
    if (!result.success) return result.error;

    const updatePayload = mapResourceUpdateToRow(result.dto);
    const { data, error } = await result.supabase
      .from('resources')
      .update(updatePayload)
      .eq('id', result.dto.id)
      .eq('clinic_id', result.dto.clinic_id)
      .select()
      .single();
    if (error) throw normalizeSupabaseError(error, PATH);
    return createSuccessResponse(data);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const clinicId = request.nextUrl.searchParams.get('clinic_id');
    const id = request.nextUrl.searchParams.get('id');
    if (!clinicId || !id)
      return createErrorResponse('clinic_id と id は必須です', 400);
    const guard = await processApiRequest(request, {
      clinicId,
      requireClinicMatch: true,
    });
    if (!guard.success) return guard.error;
    const { data, error } = await guard.supabase
      .from('resources')
      .update({ is_deleted: true })
      .eq('id', id)
      .eq('clinic_id', clinicId)
      .select('id');
    if (error) throw normalizeSupabaseError(error, PATH);
    if (!data || data.length === 0) {
      return createErrorResponse('リソースが見つかりません', 404);
    }
    return createSuccessResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
