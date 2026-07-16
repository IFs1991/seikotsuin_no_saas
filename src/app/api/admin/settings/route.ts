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
import { STAFF_ROLES } from '@/lib/constants/roles';
import { VALID_CATEGORIES } from '@/lib/admin-settings/defaults';
import {
  canManageAdminSettingsCategory,
  canReadAdminSettingsCategory,
} from '@/lib/admin-settings/access';
import {
  ADMIN_SETTINGS_MUTATION_ROLES,
  fetchAdminSettingsReadModel,
  isSettingsCategory,
  logAdminSettingsMutation,
  readClinicIdFromAdminSettingsBody,
  upsertAdminSettings,
  validateAdminSettingsMutationBody,
  validateAdminSettingsMutationSettings,
} from '@/lib/admin-settings/service';
import { canAccessClinicScope } from '@/lib/supabase';

const STAFF_ROLE_LIST = Array.from(STAFF_ROLES);
const CLINIC_ADMIN_ROLE_LIST = Array.from(ADMIN_SETTINGS_MUTATION_ROLES);

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
      return processResult.error;
    }

    const { supabase, permissions } = processResult;

    // バリデーション
    if (!clinicId) {
      return createErrorResponse('clinic_idは必須です', 400);
    }

    if (!category) {
      return createErrorResponse('categoryは必須です', 400);
    }

    if (!isSettingsCategory(category)) {
      return createErrorResponse(
        `不正なcategoryです。有効な値: ${VALID_CATEGORIES.join(', ')}`,
        400
      );
    }

    if (!canReadAdminSettingsCategory(permissions.role, category)) {
      return createErrorResponse(
        'この設定カテゴリへのアクセス権がありません',
        403
      );
    }

    const readResult = await fetchAdminSettingsReadModel(
      supabase,
      clinicId,
      category
    );
    if (!readResult.success) {
      return createErrorResponse('設定の取得に失敗しました', 500);
    }

    return createSuccessResponse({
      settings: readResult.data.settings,
      updated_at: readResult.data.updated_at,
      updated_by: readResult.data.updated_by,
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
      const previewBody: unknown = await request.clone().json();
      clinicIdForAuth = readClinicIdFromAdminSettingsBody(previewBody);
    } catch {
      clinicIdForAuth = null;
    }

    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: CLINIC_ADMIN_ROLE_LIST,
      clinicId: clinicIdForAuth,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const { supabase, auth, permissions, body } = processResult;

    const envelopeValidation = validateAdminSettingsMutationBody(body);
    if (envelopeValidation.success === false) {
      return createErrorResponse(
        envelopeValidation.message,
        envelopeValidation.status,
        envelopeValidation.details
      );
    }

    const envelope = envelopeValidation.payload;
    if (!canAccessClinicScope(permissions, envelope.clinic_id)) {
      return createErrorResponse(
        '対象クリニックへのアクセス権がありません',
        403
      );
    }

    if (!canManageAdminSettingsCategory(permissions.role, envelope.category)) {
      return createErrorResponse(
        'この設定カテゴリへのアクセス権がありません',
        403
      );
    }

    const settingsValidation = validateAdminSettingsMutationSettings(envelope);
    if (settingsValidation.success === false) {
      return createErrorResponse(
        settingsValidation.message,
        settingsValidation.status,
        settingsValidation.details
      );
    }

    const { payload } = settingsValidation;
    if (!canAccessClinicScope(permissions, payload.clinic_id)) {
      return createErrorResponse(
        '対象クリニックへのアクセス権がありません',
        403
      );
    }

    const writeResult = await upsertAdminSettings(supabase, payload, auth.id);
    if (writeResult.success === false) {
      return createErrorResponse(writeResult.message, 500);
    }

    logAdminSettingsMutation({
      userId: auth.id,
      userEmail: auth.email,
      role: permissions.role,
      clinicId: payload.clinic_id,
      category: payload.category,
    });

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
