import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  processApiRequest,
} from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import {
  menusQuerySchema,
  menuInsertSchema,
  menuUpdateSchema,
  mapMenuInsertToRow,
  mapMenuUpdateToRow,
} from './schema';

const PATH = '/api/menus';

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = menusQuerySchema.safeParse({
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
    });
    if (!guard.success) return guard.error;

    const { data, error } = await guard.supabase
      .from('menus')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('is_deleted', false)
      .order('display_order', { ascending: true });

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      durationMinutes: row.duration_minutes,
      price: row.price,
      description: row.description ?? '',
      isActive: row.is_active,
      options: row.options ?? [],
    }));
    return createSuccessResponse(mapped);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(request, menuInsertSchema);
    if (!result.success) return result.error;

    const insertPayload = mapMenuInsertToRow(result.dto, result.auth.id);
    const { data, error } = await result.supabase
      .from('menus')
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
    const result = await processClinicScopedBody(request, menuUpdateSchema);
    if (!result.success) return result.error;

    const updatePayload = mapMenuUpdateToRow(result.dto);
    const { data, error } = await result.supabase
      .from('menus')
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
      .from('menus')
      .update({ is_deleted: true })
      .eq('id', id)
      .eq('clinic_id', clinicId)
      .select('id');
    if (error) throw normalizeSupabaseError(error, PATH);
    if (!data || data.length === 0) {
      return createErrorResponse('メニューが見つかりません', 404);
    }
    return createSuccessResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
