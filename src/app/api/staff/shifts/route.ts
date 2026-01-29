import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import {
  AppError,
  createApiError,
  ERROR_CODES,
  normalizeSupabaseError,
  logError,
} from '@/lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import {
  ADMIN_UI_ROLES,
  STAFF_ROLES,
  canAccessCrossClinicWithCompat,
} from '@/lib/constants/roles';

const PATH = '/api/staff/shifts';

// クエリパラメータのスキーマ
const shiftsQuerySchema = z.object({
  clinic_id: z.string().uuid('clinic_id は有効なUUIDである必要があります'),
  start: z.string().optional(),
  end: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const parsedQuery = shiftsQuerySchema.safeParse({
      clinic_id: searchParams.get('clinic_id'),
      start: searchParams.get('start'),
      end: searchParams.get('end'),
    });

    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const { clinic_id: queryClinicId, start, end } = parsedQuery.data;

    // Q3決定: 一般スタッフも閲覧可能（自院限定）
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    const { supabase, permissions } = await ensureClinicAccess(
      request,
      PATH,
      queryClinicId,
      {
        allowedRoles: Array.from(STAFF_ROLES),
        requireClinicMatch: true,
      }
    );

    // DOD-09: テナント境界の明示 - permissions.clinic_idでスコープし、欠落時は拒否
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    const isHQ = canAccessCrossClinicWithCompat(permissions.role);

    // HQロール以外はpermissions.clinic_idが必須
    if (!isHQ && !permissions.clinic_id) {
      return createErrorResponse('クリニックが割り当てられていません', 403);
    }

    // 使用するclinic_id: HQロールはクエリパラメータ、それ以外はpermissions.clinic_id
    const clinic_id = isHQ ? queryClinicId : permissions.clinic_id!;

    // シフトデータを取得（resources テーブルと結合してスタッフ名を取得）
    let query = supabase
      .from('staff_shifts')
      .select(
        `
        id,
        clinic_id,
        staff_id,
        start_time,
        end_time,
        status,
        notes,
        created_at,
        updated_at,
        resources!staff_shifts_staff_id_fkey(id, name, type)
      `
      )
      .eq('clinic_id', clinic_id)
      .order('start_time', { ascending: true });

    // 日付範囲でフィルタリング
    if (start) {
      query = query.gte('start_time', `${start}T00:00:00Z`);
    }
    if (end) {
      query = query.lte('start_time', `${end}T23:59:59Z`);
    }

    const { data: shifts, error: shiftsError } = await query;

    if (shiftsError) {
      throw normalizeSupabaseError(shiftsError, PATH);
    }

    // レスポンス形式に変換

    const formattedShifts = (shifts || []).map((shift: any) => {
      // Supabaseのリレーションは配列または単一オブジェクトで返される
      const resource = Array.isArray(shift.resources)
        ? shift.resources[0]
        : shift.resources;

      return {
        id: shift.id,
        clinic_id: shift.clinic_id,
        staff_id: shift.staff_id,
        start_time: shift.start_time,
        end_time: shift.end_time,
        status: shift.status,
        notes: shift.notes,
        created_at: shift.created_at,
        updated_at: shift.updated_at,
        staff: resource
          ? {
              id: resource.id,
              name: resource.name,
              type: resource.type,
            }
          : null,
      };
    });

    return createSuccessResponse({
      shifts: formattedShifts,
      total: formattedShifts.length,
    });
  } catch (error) {
    let apiError;
    let statusCode = 500;

    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = error;
    } else {
      apiError = createApiError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'シフトデータの取得に失敗しました',
        undefined,
        PATH
      );
    }

    logError(error instanceof Error ? error : new Error(String(error)), {
      path: PATH,
    });

    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}

// POST: シフトの作成
export async function POST(request: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return createErrorResponse('無効なJSONデータです', 400);
    }

    const shiftInsertSchema = z.object({
      clinic_id: z.string().uuid(),
      staff_id: z.string().uuid(),
      start_time: z.string().datetime(),
      end_time: z.string().datetime(),
      status: z
        .enum(['draft', 'proposed', 'confirmed', 'cancelled'])
        .default('draft'),
      notes: z.string().optional(),
    });

    const parsedBody = shiftInsertSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedBody.error.flatten()
      );
    }

    const dto = parsedBody.data;

    const { supabase, user } = await ensureClinicAccess(
      request,
      PATH,
      dto.clinic_id,
      {
        allowedRoles: Array.from(ADMIN_UI_ROLES),
        requireClinicMatch: true,
      }
    );

    const { data, error } = await supabase
      .from('staff_shifts')
      .insert({
        ...dto,
        created_by: user.id,
      })
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
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = normalizeSupabaseError(error, PATH);
    } else {
      apiError = createApiError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'シフトの作成に失敗しました',
        undefined,
        PATH
      );
    }

    logError(error instanceof Error ? error : new Error(String(error)), {
      path: PATH,
    });

    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}
