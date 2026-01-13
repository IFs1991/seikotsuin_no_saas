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

const PATH = '/api/staff/preferences';

// クエリパラメータのスキーマ
const preferencesQuerySchema = z.object({
  clinic_id: z.string().uuid('clinic_id は有効なUUIDである必要があります'),
  staff_id: z.string().uuid().optional(),
  active_only: z
    .string()
    .transform(val => val === 'true')
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const parsedQuery = preferencesQuerySchema.safeParse({
      clinic_id: searchParams.get('clinic_id'),
      staff_id: searchParams.get('staff_id') ?? undefined,
      active_only: searchParams.get('active_only') ?? undefined,
    });

    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const { clinic_id, staff_id, active_only } = parsedQuery.data;

    const { supabase } = await ensureClinicAccess(request, PATH, clinic_id, {
      requireClinicMatch: true,
    });

    // 希望データを取得（resources テーブルと結合してスタッフ名を取得）
    let query = supabase
      .from('staff_preferences')
      .select(
        `
        id,
        clinic_id,
        staff_id,
        preference_text,
        preference_type,
        priority,
        valid_from,
        valid_until,
        is_active,
        created_at,
        updated_at,
        resources!staff_preferences_staff_id_fkey(id, name, type)
      `
      )
      .eq('clinic_id', clinic_id)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    // スタッフIDでフィルタリング
    if (staff_id) {
      query = query.eq('staff_id', staff_id);
    }

    // アクティブのみフィルタリング
    if (active_only) {
      query = query.eq('is_active', true);
    }

    const { data: preferences, error: preferencesError } = await query;

    if (preferencesError) {
      throw normalizeSupabaseError(preferencesError, PATH);
    }

    // レスポンス形式に変換
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedPreferences = (preferences || []).map((pref: any) => {
      // Supabaseのリレーションは配列または単一オブジェクトで返される
      const resource = Array.isArray(pref.resources)
        ? pref.resources[0]
        : pref.resources;

      return {
        id: pref.id,
        clinic_id: pref.clinic_id,
        staff_id: pref.staff_id,
        preference_text: pref.preference_text,
        preference_type: pref.preference_type,
        priority: pref.priority,
        valid_from: pref.valid_from,
        valid_until: pref.valid_until,
        is_active: pref.is_active,
        created_at: pref.created_at,
        updated_at: pref.updated_at,
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
      preferences: formattedPreferences,
      total: formattedPreferences.length,
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
        'スタッフ希望データの取得に失敗しました',
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

// POST: 希望の作成
export async function POST(request: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return createErrorResponse('無効なJSONデータです', 400);
    }

    const preferenceInsertSchema = z.object({
      clinic_id: z.string().uuid(),
      staff_id: z.string().uuid(),
      preference_text: z.string().min(1, '希望内容を入力してください'),
      preference_type: z
        .enum(['general', 'day_off', 'time_preference', 'shift_pattern'])
        .default('general'),
      priority: z.number().int().min(1).max(5).default(1),
      valid_from: z.string().optional(),
      valid_until: z.string().optional(),
    });

    const parsedBody = preferenceInsertSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedBody.error.flatten()
      );
    }

    const dto = parsedBody.data;

    const { supabase } = await ensureClinicAccess(
      request,
      PATH,
      dto.clinic_id,
      {
        requireClinicMatch: true,
      }
    );

    const { data, error } = await supabase
      .from('staff_preferences')
      .insert(dto)
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
        'スタッフ希望の作成に失敗しました',
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
