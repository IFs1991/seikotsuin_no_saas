import { NextRequest } from 'next/server';
import { z } from 'zod';
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
  normalizeShiftRequestRole,
} from '@/lib/staff/shift-requests/access';
import { resolveActorStaffResourceId } from '@/lib/staff/shift-requests/actor';
import { shiftRequestPatchSchema } from '@/lib/staff/shift-requests/schema';
import { assertShiftRequestPatchStatusTransition } from '@/lib/staff/shift-requests/state';
import type {
  ShiftRequestPeriodRow,
  ShiftRequestRow,
  ShiftRequestUpdate,
} from '@/lib/staff/shift-requests/types';
import type { Json } from '@/types/supabase';
import { ensureScopedBusinessWriteAccess } from '@/lib/billing/business-write';

const PATH = '/api/staff/shift-requests/[id]';
const SHIFT_REQUEST_SELECT =
  'id, clinic_id, period_id, staff_id, request_type, start_time, end_time, priority, status, note, submitted_by, submitted_for_role, reviewed_by, reviewed_at, rejection_reason, converted_shift_id, created_at, updated_at';

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function isSelfMutableStatus(status: string) {
  return status === 'draft' || status === 'submitted' || status === 'rejected';
}

function assertSelfCanMutate(
  request: ShiftRequestRow,
  period: ShiftRequestPeriodRow
) {
  if (!isSelfMutableStatus(request.status)) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      'この希望シフトは本人編集できません',
      403
    );
  }

  if (new Date().getTime() > new Date(period.submission_deadline).getTime()) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      '提出期限後は本人編集できません',
      403
    );
  }

  if (period.status !== 'open') {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      '受付中ではない提出期間は本人編集できません',
      403
    );
  }
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) {
      return createErrorResponse('id はUUID形式で指定してください', 400);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return createErrorResponse('無効なJSONデータです', 400);
    }

    const parsedBody = shiftRequestPatchSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedBody.error.flatten()
      );
    }

    const dto = parsedBody.data;
    if (dto.status === 'rejected' && !dto.rejection_reason?.trim()) {
      return createErrorResponse('差戻し理由は必須です', 400);
    }

    const { supabase, user, permissions } = await ensureClinicAccess(
      request,
      PATH,
      dto.clinic_id,
      {
        allowedRoles: Array.from(STAFF_ROLES),
        requireClinicMatch: true,
      }
    );

    await ensureScopedBusinessWriteAccess({
      permissions,
      targetClinicId: dto.clinic_id,
    });

    const { data: existingData, error: existingError } = await supabase
      .from('shift_requests')
      .select(SHIFT_REQUEST_SELECT)
      .eq('id', parsedId.data)
      .eq('clinic_id', dto.clinic_id)
      .single();

    if (existingError) {
      throw normalizeSupabaseError(existingError, PATH);
    }

    const existing = existingData as ShiftRequestRow;
    if (existing.status === 'converted') {
      throw new AppError(
        ERROR_CODES.RESOURCE_CONFLICT,
        '変換済みの希望シフトは編集できません',
        409
      );
    }

    const period = await loadRequestPeriod(
      supabase,
      dto.clinic_id,
      existing.period_id
    );
    const actorRole = normalizeShiftRequestRole(permissions.role);
    const adminClient = createShiftRequestAdminClient();
    const updatePayload: ShiftRequestUpdate = {};

    if (isShiftRequestSelfSubmitRole(actorRole)) {
      await resolveActorStaffResourceId({
        adminClient,
        actorUserId: user.id,
        permissions,
        clinicId: dto.clinic_id,
        requestedStaffId: existing.staff_id,
        path: PATH,
      });
      assertSelfCanMutate(existing, period);
      assertShiftRequestPatchStatusTransition({
        currentStatus: existing.status,
        nextStatus: dto.status,
        actorRole: permissions.role,
        isSelfActor: true,
      });
    } else {
      assertShiftRequestManagerRole(permissions);
      if (dto.status === 'withdrawn') {
        throw new AppError(
          ERROR_CODES.FORBIDDEN,
          'withdrawn は本人のみ指定できます',
          403
        );
      }
      assertShiftRequestPatchStatusTransition({
        currentStatus: existing.status,
        nextStatus: dto.status,
        actorRole: permissions.role,
        isSelfActor: false,
      });
    }

    if (dto.request_type !== undefined)
      updatePayload.request_type = dto.request_type;
    if (dto.start_time !== undefined) updatePayload.start_time = dto.start_time;
    if (dto.end_time !== undefined) updatePayload.end_time = dto.end_time;
    if (dto.priority !== undefined) updatePayload.priority = dto.priority;
    if (dto.note !== undefined) updatePayload.note = dto.note;

    if (dto.status !== undefined) {
      updatePayload.status = dto.status;

      if (dto.status === 'approved' || dto.status === 'rejected') {
        updatePayload.reviewed_by = user.id;
        updatePayload.reviewed_at = new Date().toISOString();
      }

      if (dto.status === 'approved' || dto.status === 'submitted') {
        updatePayload.rejection_reason = null;
      }
    }

    if (dto.rejection_reason !== undefined) {
      updatePayload.rejection_reason = dto.rejection_reason;
    }

    const { data, error } = await supabase
      .from('shift_requests')
      .update(updatePayload)
      .eq('id', parsedId.data)
      .eq('clinic_id', dto.clinic_id)
      .select(SHIFT_REQUEST_SELECT)
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    const shiftRequest = data as ShiftRequestRow;
    const action = dto.status ? `request_${dto.status}` : 'request_update';
    await insertShiftRequestAuditLog(
      {
        clinicId: shiftRequest.clinic_id,
        periodId: shiftRequest.period_id,
        requestId: shiftRequest.id,
        actorUserId: user.id,
        actorRole: permissions.role,
        action,
        beforeData: toJson(existing),
        afterData: toJson(shiftRequest),
      },
      PATH,
      adminClient
    );

    return createSuccessResponse(shiftRequest);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
