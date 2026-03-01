/**
 * GET /api/clinics — 全認証ユーザー向けクリニック一覧 API
 *
 * 仕様: docs/ハードコーディング解消_実装プラン_v1.0.md Task B
 * - STAFF_ROLES 以上の認証ユーザーが全アクティブクリニックを取得できる
 * - レスポンス: { success: true, data: { items: Array<{ id: string; name: string }> } }
 * - RLS は DB 側に委任。実際のデータアクセス制御は各エンドポイントの RLS が担う
 */

import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { STAFF_ROLES } from '@/lib/constants/roles';

export async function GET(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: Array.from(STAFF_ROLES),
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { supabase, auth } = processResult;

    const { data, error } = await supabase
      .from('clinics')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      logError(error, {
        endpoint: '/api/clinics',
        method: 'GET',
        userId: auth.id,
      });
      return createErrorResponse('クリニック一覧の取得に失敗しました', 500);
    }

    return createSuccessResponse({ items: data ?? [] });
  } catch (error) {
    logError(error, {
      endpoint: '/api/clinics',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
