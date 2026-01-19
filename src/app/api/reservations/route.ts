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
  reservationsQuerySchema,
  reservationInsertSchema,
  reservationUpdateSchema,
  mapReservationInsertToRow,
  mapReservationUpdateToRow,
} from './schema';

const PATH = '/api/reservations';

async function hasReservationConflict(
  supabase: any,
  params: {
    clinicId: string;
    staffId: string;
    startTime: string;
    endTime: string;
    excludeId?: string;
  }
): Promise<boolean> {
  let query = supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', params.clinicId)
    .eq('staff_id', params.staffId)
    .lt('start_time', params.endTime)
    .gt('end_time', params.startTime)
    .not('status', 'in', '("cancelled","no_show")');

  if (params.excludeId) {
    query = query.neq('id', params.excludeId);
  }

  const { count, error } = await query;
  if (error) {
    throw normalizeSupabaseError(error, PATH);
  }
  return (count ?? 0) > 0;
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = reservationsQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      id: request.nextUrl.searchParams.get('id') ?? undefined,
      start_date: request.nextUrl.searchParams.get('start_date') ?? undefined,
      end_date: request.nextUrl.searchParams.get('end_date') ?? undefined,
      staff_id: request.nextUrl.searchParams.get('staff_id') ?? undefined,
    });
    if (!parsedQuery.success) {
      return createErrorResponse('入力値にエラーがあります', 400, parsedQuery.error.flatten());
    }

    const { clinic_id, id, start_date, end_date, staff_id } = parsedQuery.data;

    const auth = await processApiRequest(request, {
      clinicId: clinic_id,
      requireClinicMatch: true,
    });
    if (!auth.success) return auth.error;

    const { supabase } = auth;

    const query = supabase
      .from('reservation_list_view')
      .select('*')
      .eq('clinic_id', clinic_id);

    if (id) {
      const { data, error } = await query.eq('id', id).maybeSingle();
      if (error) {
        throw normalizeSupabaseError(error, PATH);
      }
      if (!data) {
        return createErrorResponse('予約が見つかりません', 404);
      }

      const mapped = {
        id: data.id,
        customerId: data.customer_id,
        customerName: data.customer_name,
        menuId: data.menu_id,
        menuName: data.menu_name,
        staffId: data.staff_id,
        staffName: data.staff_name,
        startTime: data.start_time,
        endTime: data.end_time,
        status: data.status,
        channel: data.channel,
        notes: data.notes ?? undefined,
        selectedOptions: data.selected_options ?? [],
      };

      return createSuccessResponse(mapped);
    }

    if (start_date) query.gte('start_time', start_date);
    if (end_date) query.lte('start_time', end_date);
    if (staff_id) query.eq('staff_id', staff_id);

    const { data, error } = await query.order('start_time', { ascending: true });

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      menuId: row.menu_id,
      menuName: row.menu_name,
      staffId: row.staff_id,
      staffName: row.staff_name,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      channel: row.channel,
      notes: row.notes ?? undefined,
      selectedOptions: row.selected_options ?? [],
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
      apiError = createApiError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Reservation fetch failed', undefined, PATH);
    }
    logError(error instanceof Error ? error : new Error(String(error)), { path: PATH });
    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await processApiRequest(request, { requireBody: true });
    if (!auth.success) return auth.error;

    const parsedBody = reservationInsertSchema.safeParse(auth.body);
    if (!parsedBody.success) {
      return createErrorResponse('入力値にエラーがあります', 400, parsedBody.error.flatten());
    }

    const dto = parsedBody.data;
    const guard = await processApiRequest(request, {
      clinicId: dto.clinic_id,
      requireClinicMatch: true,
    });
    if (!guard.success) return guard.error;

    const conflict = await hasReservationConflict(guard.supabase, {
      clinicId: dto.clinic_id,
      staffId: dto.staffId,
      startTime: dto.startTime,
      endTime: dto.endTime,
    });
    if (conflict) {
      return createErrorResponse('同時間帯に既存予約があります', 409);
    }

    const insertPayload = mapReservationInsertToRow(dto, guard.auth.id);

    const { data, error } = await guard.supabase
      .from('reservations')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

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
      apiError = createApiError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Reservation creation failed', undefined, PATH);
    }
    logError(error instanceof Error ? error : new Error(String(error)), { path: PATH });
    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await processApiRequest(request, { requireBody: true });
    if (!auth.success) return auth.error;

    const parsedBody = reservationUpdateSchema.safeParse(auth.body);
    if (!parsedBody.success) {
      return createErrorResponse('入力値にエラーがあります', 400, parsedBody.error.flatten());
    }

    const dto = parsedBody.data;
    const guard = await processApiRequest(request, {
      clinicId: dto.clinic_id,
      requireClinicMatch: true,
    });
    if (!guard.success) return guard.error;

    if (dto.staffId || dto.startTime || dto.endTime) {
      const { data: existing, error: existingError } = await guard.supabase
        .from('reservations')
        .select('staff_id, start_time, end_time')
        .eq('id', dto.id)
        .eq('clinic_id', dto.clinic_id)
        .single();

      if (existingError) {
        throw normalizeSupabaseError(existingError, PATH);
      }

      const nextStaffId = dto.staffId ?? existing.staff_id;
      const nextStartTime = dto.startTime ?? existing.start_time;
      const nextEndTime = dto.endTime ?? existing.end_time;

      const conflict = await hasReservationConflict(guard.supabase, {
        clinicId: dto.clinic_id,
        staffId: nextStaffId,
        startTime: nextStartTime,
        endTime: nextEndTime,
        excludeId: dto.id,
      });
      if (conflict) {
        return createErrorResponse('同時間帯に既存予約があります', 409);
      }
    }

    const updatePayload = mapReservationUpdateToRow(dto);

    const { data, error } = await guard.supabase
      .from('reservations')
      .update(updatePayload)
      .eq('id', dto.id)
      .eq('clinic_id', dto.clinic_id)
      .select()
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

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
      apiError = createApiError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Reservation update failed', undefined, PATH);
    }
    logError(error instanceof Error ? error : new Error(String(error)), { path: PATH });
    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const clinicId = request.nextUrl.searchParams.get('clinic_id');
    const id = request.nextUrl.searchParams.get('id');
    if (!clinicId || !id) {
      return createErrorResponse('clinic_id と id は必須です', 400);
    }

    const guard = await processApiRequest(request, {
      clinicId,
      requireClinicMatch: true,
    });
    if (!guard.success) return guard.error;

    const { data, error } = await guard.supabase
      .from('reservations')
      .delete()
      .eq('id', id)
      .eq('clinic_id', clinicId)
      .select('id');
    if (error) throw normalizeSupabaseError(error, PATH);
    if (!data || data.length === 0) {
      return createErrorResponse('予約が見つかりません', 404);
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
      apiError = createApiError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Reservation delete failed', undefined, PATH);
    }
    logError(error instanceof Error ? error : new Error(String(error)), { path: PATH });
    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}
