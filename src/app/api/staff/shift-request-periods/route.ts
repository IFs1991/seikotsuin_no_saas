import { NextRequest } from 'next/server';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { handleRouteError } from '@/lib/route-helpers';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { STAFF_ROLES } from '@/lib/constants/roles';
import { normalizeSupabaseError } from '@/lib/error-handler';
import {
  SHIFT_REQUEST_MANAGER_ROLES,
  insertShiftRequestAuditLog,
  isShiftRequestSelfSubmitRole,
  normalizeShiftRequestRole,
} from '@/lib/staff/shift-requests/access';
import {
  shiftRequestPeriodCreateSchema,
  shiftRequestPeriodQuerySchema,
} from '@/lib/staff/shift-requests/schema';
import type {
  ShiftRequestPeriodInsert,
  ShiftRequestPeriodRow,
} from '@/lib/staff/shift-requests/types';
import type { Json } from '@/types/supabase';
import { ensureScopedBusinessWriteAccess } from '@/lib/billing/business-write';

const PATH = '/api/staff/shift-request-periods';
const SHIFT_REQUEST_PERIOD_SELECT =
  'id, clinic_id, title, period_start, period_end, submission_deadline, status, created_by, created_at, updated_at';
const SHIFT_REQUEST_PERIOD_SELF_SELECT =
  'id, clinic_id, title, period_start, period_end, submission_deadline, status, created_at, updated_at';

type ShiftRequestPeriodSelfRow = Pick<
  ShiftRequestPeriodRow,
  | 'id'
  | 'clinic_id'
  | 'title'
  | 'period_start'
  | 'period_end'
  | 'submission_deadline'
  | 'status'
  | 'created_at'
  | 'updated_at'
>;

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = shiftRequestPeriodQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      from: request.nextUrl.searchParams.get('from') ?? undefined,
      to: request.nextUrl.searchParams.get('to') ?? undefined,
      status: request.nextUrl.searchParams.get('status') ?? undefined,
    });

    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const queryDto = parsedQuery.data;
    const { supabase, permissions } = await ensureClinicAccess(
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

    let query = isSelfRole
      ? supabase
          .from('shift_request_periods')
          .select(SHIFT_REQUEST_PERIOD_SELF_SELECT)
      : supabase
          .from('shift_request_periods')
          .select(SHIFT_REQUEST_PERIOD_SELECT);

    query = query
      .eq('clinic_id', queryDto.clinic_id)
      .order('period_start', { ascending: false });

    if (queryDto.from) {
      query = query.gte('period_end', queryDto.from);
    }
    if (queryDto.to) {
      query = query.lte('period_start', queryDto.to);
    }
    if (queryDto.status) {
      query = query.eq('status', queryDto.status);
    }

    const { data, error } = await query;
    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    const responsePeriods = isSelfRole
      ? ((data ?? []) as ShiftRequestPeriodSelfRow[])
      : ((data ?? []) as ShiftRequestPeriodRow[]);
    return createSuccessResponse({
      periods: responsePeriods,
      total: responsePeriods.length,
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

    const parsedBody = shiftRequestPeriodCreateSchema.safeParse(rawBody);
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
        allowedRoles: Array.from(SHIFT_REQUEST_MANAGER_ROLES),
        requireClinicMatch: true,
      }
    );

    await ensureScopedBusinessWriteAccess({
      permissions,
      targetClinicId: dto.clinic_id,
    });

    const payload: ShiftRequestPeriodInsert = {
      clinic_id: dto.clinic_id,
      title: dto.title,
      period_start: dto.period_start,
      period_end: dto.period_end,
      submission_deadline: dto.submission_deadline,
      status: 'draft',
      created_by: user.id,
    };

    const { data, error } = await supabase
      .from('shift_request_periods')
      .insert(payload)
      .select(SHIFT_REQUEST_PERIOD_SELECT)
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    const period = data as ShiftRequestPeriodRow;
    await insertShiftRequestAuditLog(
      {
        clinicId: period.clinic_id,
        periodId: period.id,
        actorUserId: user.id,
        actorRole: permissions.role,
        action: 'period_create',
        afterData: toJson(period),
      },
      PATH
    );

    return createSuccessResponse(period, 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
