/**
 * Admin notifications API
 *
 * GET /api/admin/notifications - list notifications
 */

import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clinicId = searchParams.get('clinic_id');
  const type = searchParams.get('type');
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  try {
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (DOD-08)
    const processResult = await processApiRequest(request, {
      allowedRoles: Array.from(ADMIN_UI_ROLES),
      clinicId,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { supabase, auth } = processResult;

    if (!clinicId) {
      return createErrorResponse('clinic_idは必須です', 400);
    }

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 100));

    if (type) {
      query = query.eq('type', type);
    }

    const { data: notifications, error } = await query;

    if (error) {
      logError(error, {
        endpoint: '/api/admin/notifications',
        method: 'GET',
        userId: auth.id,
        params: { clinic_id: clinicId, type },
      });
      return createErrorResponse('通知一覧の取得に失敗しました', 500);
    }

    return createSuccessResponse({ notifications: notifications || [] });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/notifications',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
