/**
 * 管理設定永続化 API
 * 仕様書: docs/管理設定永続化_MVP仕様書.md
 * @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
 *
 * GET  /api/admin/settings - 設定取得（未登録時はデフォルト値）
 * PUT  /api/admin/settings - 設定保存（upsert）
 *
 * PR-05: defaults / schemas / normalize を src/lib/admin-settings/ に分離
 */

import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import {
  CLINIC_ADMIN_ROLES,
  STAFF_ROLES,
  type Role,
} from '@/lib/constants/roles';
import {
  VALID_CATEGORIES,
  DEFAULT_SETTINGS,
  type SettingsCategory,
} from '@/lib/admin-settings/defaults';
import { CATEGORY_SCHEMAS } from '@/lib/admin-settings/schemas';
import { normalizeCommunicationSettings } from '@/lib/admin-settings/normalize';

// 管理者権限チェック（クリニック設定管理が可能なロール）
const canManageSettings = (role: string) =>
  CLINIC_ADMIN_ROLES.has(role as Role);
const STAFF_ROLE_LIST = Array.from(STAFF_ROLES);
const CLINIC_ADMIN_ROLE_LIST = Array.from(CLINIC_ADMIN_ROLES);

/**
 * GET /api/admin/settings
 * 設定を取得（未登録時はデフォルト値を返す）
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clinicId = searchParams.get('clinic_id');
  const category = searchParams.get('category');

  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: STAFF_ROLE_LIST,
      clinicId,
      requireClinicMatch: true,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { supabase, auth } = processResult;

    // バリデーション
    if (!clinicId) {
      return createErrorResponse('clinic_idは必須です', 400);
    }

    if (!category) {
      return createErrorResponse('categoryは必須です', 400);
    }

    if (!VALID_CATEGORIES.includes(category as SettingsCategory)) {
      return createErrorResponse(
        `不正なcategoryです。有効な値: ${VALID_CATEGORIES.join(', ')}`,
        400
      );
    }

    // データベースから取得
    const { data, error } = await supabase
      .from('clinic_settings')
      .select('settings, updated_at, updated_by')
      .eq('clinic_id', clinicId)
      .eq('category', category)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116: No rows returned（これは正常なケース）
      logError(error, {
        endpoint: '/api/admin/settings',
        method: 'GET',
        userId: auth.id,
        params: { clinic_id: clinicId, category },
      });
      return createErrorResponse('設定の取得に失敗しました', 500);
    }

    // データがなければデフォルト値を返す
    const settings =
      category === 'communication'
        ? normalizeCommunicationSettings(
            data?.settings ?? DEFAULT_SETTINGS.communication
          )
        : (data?.settings ?? DEFAULT_SETTINGS[category as SettingsCategory]);

    return createSuccessResponse({
      settings,
      updated_at: data?.updated_at ?? null,
      updated_by: data?.updated_by ?? null,
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/settings',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

/**
 * PUT /api/admin/settings
 * 設定を保存（upsert）
 */
export async function PUT(request: NextRequest) {
  try {
    let clinicIdForAuth: string | null = null;
    try {
      const previewBody = await request.clone().json();
      clinicIdForAuth =
        typeof previewBody?.clinic_id === 'string'
          ? previewBody.clinic_id
          : null;
    } catch {
      clinicIdForAuth = null;
    }

    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: CLINIC_ADMIN_ROLE_LIST,
      clinicId: clinicIdForAuth,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { supabase, auth, permissions, body } = processResult;

    // 管理者権限チェック
    if (!canManageSettings(permissions.role)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    // ボディのパース
    const { clinic_id, category, settings } = body as {
      clinic_id?: string;
      category?: string;
      settings?: Record<
        SettingsCategory,
        Record<string, unknown>
      >[SettingsCategory];
    };

    // バリデーション
    if (!clinic_id) {
      return createErrorResponse('clinic_idは必須です', 400);
    }

    if (!category) {
      return createErrorResponse('categoryは必須です', 400);
    }

    if (!VALID_CATEGORIES.includes(category as SettingsCategory)) {
      return createErrorResponse(
        `不正なcategoryです。有効な値: ${VALID_CATEGORIES.join(', ')}`,
        400
      );
    }

    if (!settings || typeof settings !== 'object') {
      return createErrorResponse('settingsは必須です', 400);
    }

    // カテゴリ固有のバリデーション
    const schema = CATEGORY_SCHEMAS[category as SettingsCategory];
    const candidateSettings =
      category === 'communication'
        ? normalizeCommunicationSettings(settings)
        : settings;
    const parseResult = schema.safeParse(candidateSettings);

    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      const firstError =
        Object.values(errors.fieldErrors)[0]?.[0] ??
        errors.formErrors[0] ??
        '入力値にエラーがあります';
      return createErrorResponse(firstError, 400, errors);
    }

    // upsert実行
    const { error } = await supabase.from('clinic_settings').upsert(
      {
        clinic_id,
        category,
        settings: parseResult.data,
        updated_by: auth.id,
      },
      { onConflict: 'clinic_id,category' }
    );

    if (error) {
      logError(error, {
        endpoint: '/api/admin/settings',
        method: 'PUT',
        userId: auth.id,
        params: { clinic_id, category },
      });
      return createErrorResponse('設定の保存に失敗しました', 500);
    }

    // 監査ログはベストエフォートで実行し、レスポンスをブロックしない。
    void AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'update_settings',
      undefined,
      {
        category,
        clinic_id,
        settingsUpdated: true,
      }
    );

    return createSuccessResponse({
      message: '設定を保存しました',
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/settings',
      method: 'PUT',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
