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
  customersQuerySchema,
  customerInsertSchema,
  customerUpdateSchema,
  mapCustomerInsertToRow,
  mapCustomerUpdateToRow,
} from './schema';

const PATH = '/api/customers';

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = customersQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      q: request.nextUrl.searchParams.get('q') ?? undefined,
    });
    if (!parsedQuery.success) {
      return createErrorResponse('入力値にエラーがあります', 400, parsedQuery.error.flatten());
    }
    const { clinic_id, q } = parsedQuery.data;

    const guard = await processApiRequest(request, { clinicId: clinic_id, requireClinicMatch: true });
    if (!guard.success) return guard.error;

    let query = guard.supabase.from('customers').select('*').eq('clinic_id', clinic_id).eq('is_deleted', false);
    if (q) {
      query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
    }
    const { data, error } = await query.order('created_at', { ascending: false }).limit(50);

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email ?? undefined,
      notes: row.notes ?? undefined,
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
      apiError = createApiError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Customers fetch failed', undefined, PATH);
    }
    logError(error instanceof Error ? error : new Error(String(error)), { path: PATH });
    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await processApiRequest(request, { requireBody: true });
    if (!auth.success) return auth.error;
    const parsedBody = customerInsertSchema.safeParse(auth.body);
    if (!parsedBody.success) {
      return createErrorResponse('入力値にエラーがあります', 400, parsedBody.error.flatten());
    }
    const dto = parsedBody.data;
    const guard = await processApiRequest(request, { clinicId: dto.clinic_id, requireClinicMatch: true });
    if (!guard.success) return guard.error;
    const insertPayload = mapCustomerInsertToRow(dto, guard.auth.id);
    const { data, error } = await guard.supabase.from('customers').insert(insertPayload).select().single();
    if (error) throw normalizeSupabaseError(error, PATH);
    return createSuccessResponse(data, 201);
  } catch (error) {
    let apiError;
    let statusCode = 500;
    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else {
      apiError = createApiError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Customer creation failed', undefined, PATH);
    }
    logError(error instanceof Error ? error : new Error(String(error)), { path: PATH });
    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await processApiRequest(request, { requireBody: true });
    if (!auth.success) return auth.error;
    const parsedBody = customerUpdateSchema.safeParse(auth.body);
    if (!parsedBody.success) {
      return createErrorResponse('入力値にエラーがあります', 400, parsedBody.error.flatten());
    }
    const dto = parsedBody.data;
    const guard = await processApiRequest(request, { clinicId: dto.clinic_id, requireClinicMatch: true });
    if (!guard.success) return guard.error;
    const updatePayload = mapCustomerUpdateToRow(dto);
    const { data, error } = await guard.supabase.from('customers').update(updatePayload).eq('id', dto.id).select().single();
    if (error) throw normalizeSupabaseError(error, PATH);
    return createSuccessResponse(data);
  } catch (error) {
    let apiError;
    let statusCode = 500;
    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else {
      apiError = createApiError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Customer update failed', undefined, PATH);
    }
    logError(error instanceof Error ? error : new Error(String(error)), { path: PATH });
    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}
