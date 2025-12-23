import { NextRequest } from 'next/server';
import { createErrorResponse, createSuccessResponse, processApiRequest } from '@/lib/api-helpers';
import {
  AppError,
  createApiError,
  ERROR_CODES,
  normalizeSupabaseError,
  logError,
} from '@/lib/error-handler';
import {
  resourcesQuerySchema,
  resourceInsertSchema,
  resourceUpdateSchema,
  mapResourceInsertToRow,
  mapResourceUpdateToRow,
} from './schema';

const PATH = '/api/resources';

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = resourcesQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      type: request.nextUrl.searchParams.get('type') ?? undefined,
    });
    if (!parsedQuery.success) {
      return createErrorResponse('入力値にエラーがあります', 400, parsedQuery.error.flatten());
    }
    const { clinic_id, type } = parsedQuery.data;
    const guard = await processApiRequest(request, { clinicId: clinic_id, requireClinicMatch: true });
    if (!guard.success) return guard.error;

    let query = guard.supabase.from('resources').select('*').eq('clinic_id', clinic_id).eq('is_deleted', false);
    if (type) query = query.eq('type', type);
    const { data, error } = await query.order('display_order', { ascending: true });
    if (error) throw normalizeSupabaseError(error, PATH);

    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      workingHours: row.working_hours ?? {},
      supportedMenus: row.supported_menus ?? [],
      maxConcurrent: row.max_concurrent ?? 1,
      isActive: row.is_active,
    }));
    return createSuccessResponse(mapped);
  } catch (error) {
    let apiError;
    let statusCode = 500;
    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = normalizeSupabaseError(error, PATH);
    } else {
      apiError = createApiError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Resources fetch failed', undefined, PATH);
    }
    logError(error instanceof Error ? error : new Error(String(error)), { path: PATH });
    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await processApiRequest(request, { requireBody: true });
    if (!auth.success) return auth.error;
    const parsedBody = resourceInsertSchema.safeParse(auth.body);
    if (!parsedBody.success) return createErrorResponse('入力値にエラーがあります', 400, parsedBody.error.flatten());
    const dto = parsedBody.data;
    const guard = await processApiRequest(request, { clinicId: dto.clinic_id, requireClinicMatch: true });
    if (!guard.success) return guard.error;
    const insertPayload = mapResourceInsertToRow(dto, guard.auth.id);
    const { data, error } = await guard.supabase.from('resources').insert(insertPayload).select().single();
    if (error) throw normalizeSupabaseError(error, PATH);
    return createSuccessResponse(data, 201);
  } catch (error) {
    let apiError;
    let statusCode = 500;
    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else {
      apiError = createApiError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Resource creation failed', undefined, PATH);
    }
    logError(error instanceof Error ? error : new Error(String(error)), { path: PATH });
    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await processApiRequest(request, { requireBody: true });
    if (!auth.success) return auth.error;
    const parsedBody = resourceUpdateSchema.safeParse(auth.body);
    if (!parsedBody.success) return createErrorResponse('入力値にエラーがあります', 400, parsedBody.error.flatten());
    const dto = parsedBody.data;
    const guard = await processApiRequest(request, { clinicId: dto.clinic_id, requireClinicMatch: true });
    if (!guard.success) return guard.error;
    const updatePayload = mapResourceUpdateToRow(dto);
    const { data, error } = await guard.supabase.from('resources').update(updatePayload).eq('id', dto.id).select().single();
    if (error) throw normalizeSupabaseError(error, PATH);
    return createSuccessResponse(data);
  } catch (error) {
    let apiError;
    let statusCode = 500;
    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else {
      apiError = createApiError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Resource update failed', undefined, PATH);
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
    const { error } = await guard.supabase.from('resources').update({ is_deleted: true }).eq('id', id);
    if (error) throw normalizeSupabaseError(error, PATH);
    return createSuccessResponse({ deleted: true });
  } catch (error) {
    let apiError;
    let statusCode = 500;
    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else {
      apiError = createApiError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Resource delete failed', undefined, PATH);
    }
    logError(error instanceof Error ? error : new Error(String(error)), { path: PATH });
    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}
