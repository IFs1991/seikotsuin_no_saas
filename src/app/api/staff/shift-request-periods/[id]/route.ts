import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { handleRouteError } from '@/lib/route-helpers';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import {
  AppError,
  ERROR_CODES,
  normalizeSupabaseError,
} from '@/lib/error-handler';
import {
  SHIFT_REQUEST_MANAGER_ROLES,
  insertShiftRequestAuditLog,
  isShiftRequestConversionRole,
} from '@/lib/staff/shift-requests/access';
import { shiftRequestPeriodPatchSchema } from '@/lib/staff/shift-requests/schema';
import type {
  ShiftRequestPeriodRow,
  ShiftRequestPeriodStatus,
  ShiftRequestPeriodUpdate,
} from '@/lib/staff/shift-requests/types';
import type { Json } from '@/types/supabase';

const PATH = '/api/staff/shift-request-periods/[id]';

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function assertPeriodStatusTransition({
  currentStatus,
  nextStatus,
  actorRole,
}: {
  currentStatus: string;
  nextStatus: ShiftRequestPeriodStatus | undefined;
  actorRole: string;
}) {
  if (currentStatus === 'finalized' || currentStatus === 'cancelled') {
    throw new AppError(
      ERROR_CODES.RESOURCE_CONFLICT,
      '確定または取消済みの提出期間は編集できません',
      409
    );
  }

  if (!nextStatus || nextStatus === currentStatus) {
    return;
  }

  const transition = `${currentStatus}->${nextStatus}`;
  if (transition === 'draft->open' || transition === 'open->closed') {
    return;
  }

  if (
    (transition === 'closed->finalized' ||
      (['draft', 'open', 'closed'].includes(currentStatus) &&
        nextStatus === 'cancelled')) &&
    isShiftRequestConversionRole(actorRole)
  ) {
    return;
  }

  throw new AppError(
    ERROR_CODES.FORBIDDEN,
    '提出期間の状態遷移が許可されていません',
    403
  );
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

    const parsedBody = shiftRequestPeriodPatchSchema.safeParse(rawBody);
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

    const { data: existingData, error: existingError } = await supabase
      .from('shift_request_periods')
      .select(
        'id, clinic_id, title, period_start, period_end, submission_deadline, status, created_by, created_at, updated_at'
      )
      .eq('id', parsedId.data)
      .eq('clinic_id', dto.clinic_id)
      .single();

    if (existingError) {
      throw normalizeSupabaseError(existingError, PATH);
    }

    const existing = existingData as ShiftRequestPeriodRow;
    assertPeriodStatusTransition({
      currentStatus: existing.status,
      nextStatus: dto.status,
      actorRole: permissions.role,
    });

    const nextStart = dto.period_start ?? existing.period_start;
    const nextEnd = dto.period_end ?? existing.period_end;
    if (
      new Date(`${nextEnd}T00:00:00.000Z`).getTime() <
      new Date(`${nextStart}T00:00:00.000Z`).getTime()
    ) {
      return createErrorResponse(
        'period_end は period_start 以降にしてください',
        400
      );
    }

    const updatePayload: ShiftRequestPeriodUpdate = {};
    if (dto.title !== undefined) updatePayload.title = dto.title;
    if (dto.period_start !== undefined)
      updatePayload.period_start = dto.period_start;
    if (dto.period_end !== undefined) updatePayload.period_end = dto.period_end;
    if (dto.submission_deadline !== undefined)
      updatePayload.submission_deadline = dto.submission_deadline;
    if (dto.status !== undefined) updatePayload.status = dto.status;

    const { data, error } = await supabase
      .from('shift_request_periods')
      .update(updatePayload)
      .eq('id', parsedId.data)
      .eq('clinic_id', dto.clinic_id)
      .select(
        'id, clinic_id, title, period_start, period_end, submission_deadline, status, created_by, created_at, updated_at'
      )
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
        action: dto.status ? `period_${dto.status}` : 'period_update',
        beforeData: toJson(existing),
        afterData: toJson(period),
      },
      PATH
    );

    return createSuccessResponse(period);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
