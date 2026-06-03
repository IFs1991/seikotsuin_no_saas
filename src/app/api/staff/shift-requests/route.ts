import { NextRequest } from 'next/server';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { handleRouteError } from '@/lib/route-helpers';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { STAFF_ROLES } from '@/lib/constants/roles';
import {
  AppError,
  ERROR_CODES,
  normalizeSupabaseError,
} from '@/lib/error-handler';
import {
  assertShiftRequestManagerRole,
  createShiftRequestAdminClient,
  insertShiftRequestAuditLog,
  isShiftRequestSelfSubmitRole,
  loadStaffResourceForShiftRequest,
  normalizeShiftRequestRole,
  resolveSubmittedForRole,
} from '@/lib/staff/shift-requests/access';
import { resolveActorStaffResourceId } from '@/lib/staff/shift-requests/actor';
import {
  shiftRequestCreateSchema,
  shiftRequestQuerySchema,
} from '@/lib/staff/shift-requests/schema';
import type {
  ShiftRequestInsert,
  ShiftRequestPeriodRow,
  ShiftRequestRow,
} from '@/lib/staff/shift-requests/types';
import type { Json } from '@/types/supabase';

const PATH = '/api/staff/shift-requests';
const SHIFT_REQUEST_SELECT =
  'id, clinic_id, period_id, staff_id, request_type, start_time, end_time, priority, status, note, submitted_by, submitted_for_role, reviewed_by, reviewed_at, rejection_reason, converted_shift_id, created_at, updated_at';
const SHIFT_REQUEST_SELF_SELECT =
  'id, clinic_id, period_id, staff_id, request_type, start_time, end_time, priority, status, note, rejection_reason, converted_shift_id, created_at, updated_at';

type ShiftRequestSelfRow = Pick<
  ShiftRequestRow,
  | 'id'
  | 'clinic_id'
  | 'period_id'
  | 'staff_id'
  | 'request_type'
  | 'start_time'
  | 'end_time'
  | 'priority'
  | 'status'
  | 'note'
  | 'rejection_reason'
  | 'converted_shift_id'
  | 'created_at'
  | 'updated_at'
>;

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function isSelfEditablePeriod(status: string) {
  return status === 'open';
}

function isProxyCreatablePeriod(status: string) {
  return status === 'draft' || status === 'open';
}

async function loadRequestPeriod(
  supabase: Awaited<ReturnType<typeof ensureClinicAccess>>['supabase'],
  clinicId: string,
  periodId: string
): Promise<ShiftRequestPeriodRow> {
  const { data, error } = await supabase
    .from('shift_request_periods')
    .select(
      'id, clinic_id, title, period_start, period_end, submission_deadline, status, created_by, created_at, updated_at'
    )
    .eq('id', periodId)
    .eq('clinic_id', clinicId)
    .single();

  if (error) {
    throw normalizeSupabaseError(error, PATH);
  }

  return data as ShiftRequestPeriodRow;
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = shiftRequestQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      period_id: request.nextUrl.searchParams.get('period_id'),
      staff_id: request.nextUrl.searchParams.get('staff_id') ?? undefined,
      status: request.nextUrl.searchParams.get('status') ?? undefined,
      request_type:
        request.nextUrl.searchParams.get('request_type') ?? undefined,
    });

    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const queryDto = parsedQuery.data;
    const { supabase, user, permissions } = await ensureClinicAccess(
      request,
      PATH,
      queryDto.clinic_id,
      {
        allowedRoles: Array.from(STAFF_ROLES),
        requireClinicMatch: true,
      }
    );

    const actorRole = normalizeShiftRequestRole(permissions.role);
    const isSelfRole = isShiftRequestSelfSubmitRole(actorRole);
    const adminClient = createShiftRequestAdminClient();
    let resolvedStaffId = queryDto.staff_id;

    if (isSelfRole) {
      const actorResource = await resolveActorStaffResourceId({
        adminClient,
        actorUserId: user.id,
        permissions,
        clinicId: queryDto.clinic_id,
        requestedStaffId: queryDto.staff_id,
        path: PATH,
      });
      resolvedStaffId = actorResource.staffResourceId;
    } else if (queryDto.staff_id) {
      await loadStaffResourceForShiftRequest(
        adminClient,
        queryDto.clinic_id,
        queryDto.staff_id,
        PATH
      );
    }

    let query = isSelfRole
      ? supabase.from('shift_requests').select(SHIFT_REQUEST_SELF_SELECT)
      : supabase.from('shift_requests').select(SHIFT_REQUEST_SELECT);

    query = query
      .eq('clinic_id', queryDto.clinic_id)
      .eq('period_id', queryDto.period_id)
      .order('start_time', { ascending: true });

    if (resolvedStaffId) {
      query = query.eq('staff_id', resolvedStaffId);
    }
    if (queryDto.status) {
      query = query.eq('status', queryDto.status);
    }
    if (queryDto.request_type) {
      query = query.eq('request_type', queryDto.request_type);
    }

    const { data, error } = await query;
    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    const responseRequests = isSelfRole
      ? ((data ?? []) as ShiftRequestSelfRow[])
      : ((data ?? []) as ShiftRequestRow[]);

    return createSuccessResponse({
      requests: responseRequests,
      total: responseRequests.length,
    });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function POST(request: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return createErrorResponse('無効なJSONデータです', 400);
    }

    const parsedBody = shiftRequestCreateSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedBody.error.flatten()
      );
    }

    const dto = parsedBody.data;
    const { supabase, user, permissions } = await ensureClinicAccess(
      request,
      PATH,
      dto.clinic_id,
      {
        allowedRoles: Array.from(STAFF_ROLES),
        requireClinicMatch: true,
      }
    );

    const period = await loadRequestPeriod(
      supabase,
      dto.clinic_id,
      dto.period_id
    );
    const actorRole = normalizeShiftRequestRole(permissions.role);
    const adminClient = createShiftRequestAdminClient();
    let staffId: string;
    let submittedForRole: ShiftRequestInsert['submitted_for_role'];

    if (isShiftRequestSelfSubmitRole(actorRole)) {
      if (!isSelfEditablePeriod(period.status)) {
        throw new AppError(
          ERROR_CODES.RESOURCE_CONFLICT,
          '提出期間が受付中ではありません',
          409
        );
      }

      const actorResource = await resolveActorStaffResourceId({
        adminClient,
        actorUserId: user.id,
        permissions,
        clinicId: dto.clinic_id,
        requestedStaffId: dto.staff_id,
        path: PATH,
      });
      staffId = actorResource.staffResourceId;
      submittedForRole = actorResource.submittedForRole;
    } else {
      assertShiftRequestManagerRole(permissions);
      if (!dto.staff_id) {
        return createErrorResponse('staff_id は必須です', 400);
      }
      if (!isProxyCreatablePeriod(period.status)) {
        throw new AppError(
          ERROR_CODES.RESOURCE_CONFLICT,
          'この提出期間には希望シフトを作成できません',
          409
        );
      }

      const [, resolvedSubmittedForRole] = await Promise.all([
        loadStaffResourceForShiftRequest(
          adminClient,
          dto.clinic_id,
          dto.staff_id,
          PATH
        ),
        resolveSubmittedForRole(adminClient, dto.staff_id, PATH),
      ]);
      staffId = dto.staff_id;
      submittedForRole = resolvedSubmittedForRole;
    }

    const payload: ShiftRequestInsert = {
      clinic_id: dto.clinic_id,
      period_id: dto.period_id,
      staff_id: staffId,
      request_type: dto.request_type,
      start_time: dto.start_time,
      end_time: dto.end_time,
      priority: dto.priority,
      status: dto.status,
      submitted_by: user.id,
      submitted_for_role: submittedForRole,
    };
    if (dto.note !== undefined) payload.note = dto.note;

    const { data, error } = await supabase
      .from('shift_requests')
      .insert(payload)
      .select(SHIFT_REQUEST_SELECT)
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    const shiftRequest = data as ShiftRequestRow;
    await insertShiftRequestAuditLog(
      {
        clinicId: shiftRequest.clinic_id,
        periodId: shiftRequest.period_id,
        requestId: shiftRequest.id,
        actorUserId: user.id,
        actorRole: permissions.role,
        action:
          shiftRequest.status === 'submitted'
            ? 'request_submit'
            : 'request_create',
        afterData: toJson(shiftRequest),
      },
      PATH,
      adminClient
    );

    return createSuccessResponse(shiftRequest, 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
