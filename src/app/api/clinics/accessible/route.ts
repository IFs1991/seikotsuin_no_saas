import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { STAFF_ROLES } from '@/lib/constants/roles';
import type { UserPermissions } from '@/lib/supabase';

function resolveScopedClinicIds(permissions: UserPermissions): string[] | null {
  if (permissions.clinic_scope_ids && permissions.clinic_scope_ids.length > 0) {
    return permissions.clinic_scope_ids;
  }

  if (permissions.clinic_id) {
    return [permissions.clinic_id];
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: Array.from(STAFF_ROLES),
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { supabase, auth, permissions } = processResult;
    const scopedClinicIds = resolveScopedClinicIds(permissions);

    if (!scopedClinicIds) {
      return createErrorResponse('クリニックスコープが設定されていません', 403);
    }

    let query = supabase.from('clinics').select('id, name');

    if ('in' in query && typeof query.in === 'function') {
      query = query.in('id', scopedClinicIds);
    }

    const { data, error } = await query
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      logError(error, {
        endpoint: '/api/clinics/accessible',
        method: 'GET',
        userId: auth.id,
      });
      return createErrorResponse(
        '利用可能なクリニック一覧の取得に失敗しました',
        500
      );
    }

    return createSuccessResponse({
      clinics: data ?? [],
      currentClinicId: permissions.clinic_id,
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/clinics/accessible',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
