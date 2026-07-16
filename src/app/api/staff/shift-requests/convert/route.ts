import { NextRequest } from 'next/server';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { handleRouteError } from '@/lib/route-helpers';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { normalizeSupabaseError } from '@/lib/error-handler';
import {
  SHIFT_REQUEST_CONVERSION_ROLES,
  assertShiftRequestConversionRole,
  createShiftRequestAdminClient,
  normalizeShiftRequestRole,
} from '@/lib/staff/shift-requests/access';
import { shiftRequestConvertSchema } from '@/lib/staff/shift-requests/schema';
import { ensureScopedBusinessWriteAccess } from '@/lib/billing/business-write';

const PATH = '/api/staff/shift-requests/convert';

function uniqueRequestIds(requestIds: readonly string[] | undefined): string[] {
  return Array.from(new Set(requestIds ?? []));
}

export async function POST(request: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return createErrorResponse('無効なJSONデータです', 400);
    }

    const parsedBody = shiftRequestConvertSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedBody.error.flatten()
      );
    }

    const dto = parsedBody.data;
    const requestIds = uniqueRequestIds(dto.request_ids);
    if (dto.mode === 'selected' && requestIds.length === 0) {
      return createErrorResponse('request_ids は必須です', 400);
    }

    const { user, permissions } = await ensureClinicAccess(
      request,
      PATH,
      dto.clinic_id,
      {
        allowedRoles: Array.from(SHIFT_REQUEST_CONVERSION_ROLES),
        requireClinicMatch: true,
      }
    );
    assertShiftRequestConversionRole(permissions);
    await ensureScopedBusinessWriteAccess({
      permissions,
      targetClinicId: dto.clinic_id,
    });
    const actorRole =
      normalizeShiftRequestRole(permissions.role) ?? permissions.role;

    const adminClient = createShiftRequestAdminClient();
    const { data, error } = await adminClient.rpc('convert_shift_requests', {
      p_clinic_id: dto.clinic_id,
      p_period_id: dto.period_id,
      p_request_ids: dto.mode === 'selected' ? requestIds : undefined,
      p_mode: dto.mode,
      p_actor_user_id: user.id,
      p_actor_role: actorRole,
    });

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse({
      conversions: data ?? [],
      total: data?.length ?? 0,
    });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
