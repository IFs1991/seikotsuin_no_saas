import { NextRequest } from 'next/server';
import { createErrorResponse, createSuccessResponse, processApiRequest } from '@/lib/api-helpers';
import {
  AppError,
  createApiError,
  ERROR_CODES,
  getStatusCodeFromErrorCode,
  isApiError,
  normalizeSupabaseError,
  logError,
} from '@/lib/error-handler';
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
      return createErrorResponse('入力値にエラーがあります', 400, parsedQuery.error.flatten());
    }
    const { clinic_id } = parsedQuery.data;
    const guard = await processApiRequest(request, { clinicId: clinic_id, requireClinicMatch: true });
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
    let apiError;
    let statusCode = 500;
    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else if (isApiError(error)) {
      apiError = error;
      statusCode = getStatusCodeFromErrorCode(apiError.code);
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = normalizeSupabaseError(error, PATH);
      statusCode = getStatusCodeFromErrorCode(apiError.code);
    } else {
      apiError = createApiError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Menus fetch failed', undefined, PATH);
    }
    logError(error instanceof Error ? error : new Error(String(error)), { path: PATH });
    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await processApiRequest(request, { requireBody: true });
    if (!auth.success) return auth.error;
    const parsedBody = menuInsertSchema.safeParse(auth.body);
    if (!parsedBody.success) {
      return createErrorResponse('入力値にエラーがあります', 400, parsedBody.error.flatten());
    }
    const dto = parsedBody.data;
    const guard = await processApiRequest(request, { clinicId: dto.clinic_id, requireClinicMatch: true });
    if (!guard.success) return guard.error;

    const insertPayload = mapMenuInsertToRow(dto, guard.auth.id);
    const { data, error } = await guard.supabase.from('menus').insert(insertPayload).select().single();
    if (error) throw normalizeSupabaseError(error, PATH);
    return createSuccessResponse(data, 201);
  } catch (error) {
    let apiError;
    let statusCode = 500;
    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else if (isApiError(error)) {
      apiError = error;
      statusCode = getStatusCodeFromErrorCode(apiError.code);
    } else {
      apiError = createApiError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Menu creation failed', undefined, PATH);
    }
    logError(error instanceof Error ? error : new Error(String(error)), { path: PATH });
    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await processApiRequest(request, { requireBody: true });
    if (!auth.success) return auth.error;
    const parsedBody = menuUpdateSchema.safeParse(auth.body);
    if (!parsedBody.success) {
      return createErrorResponse('入力値にエラーがあります', 400, parsedBody.error.flatten());
    }
    const dto = parsedBody.data;
    const guard = await processApiRequest(request, { clinicId: dto.clinic_id, requireClinicMatch: true });
    if (!guard.success) return guard.error;

    const updatePayload = mapMenuUpdateToRow(dto);
    const { data, error } = await guard.supabase.from('menus').update(updatePayload).eq('id', dto.id).eq('clinic_id', dto.clinic_id).select().single();
    if (error) throw normalizeSupabaseError(error, PATH);
    return createSuccessResponse(data);
  } catch (error) {
    let apiError;
    let statusCode = 500;
    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else if (isApiError(error)) {
      apiError = error;
      statusCode = getStatusCodeFromErrorCode(apiError.code);
    } else {
      apiError = createApiError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Menu update failed', undefined, PATH);
    }
    logError(error instanceof Error ? error : new Error(String(error)), { path: PATH });
    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const clinicId = request.nextUrl.searchParams.get('clinic_id');
    const id = request.nextUrl.searchParams.get('id');
    if (!clinicId || !id) return createErrorResponse('clinic_id と id は必須です', 400);
    const guard = await processApiRequest(request, { clinicId, requireClinicMatch: true });
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
    let apiError;
    let statusCode = 500;
    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else if (isApiError(error)) {
      apiError = error;
      statusCode = getStatusCodeFromErrorCode(apiError.code);
    } else {
      apiError = createApiError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Menu delete failed', undefined, PATH);
    }
    logError(error instanceof Error ? error : new Error(String(error)), { path: PATH });
    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}
