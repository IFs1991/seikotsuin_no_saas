import { NextRequest } from 'next/server';
import {
  processApiRequest,
  createSuccessResponse,
  createErrorResponse,
  logError,
} from '@/lib/api-helpers';
import { createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const result = await processApiRequest(request);

  if (!result.success) {
    return result.error;
  }

  const { auth, permissions } = result;

  const clinicIds =
    (permissions as any).clinic_scope_ids ??
    (permissions.clinic_id ? [permissions.clinic_id] : null);

  if (!clinicIds || clinicIds.length === 0) {
    return createErrorResponse('院へのアクセス権がありません', 403);
  }

  try {
    const adminSupabase = createAdminClient();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // NOTE: system_events テーブルは migration 未作成のため、
    // systemStatus の degraded / maintenance 判定は未実装。
    // テーブル追加後に障害検知ロジックを実装する。
    const [clinicsResult, aiResult] = await Promise.all([
      adminSupabase
        .from('clinics')
        .select('*', { count: 'exact', head: true })
        .in('id', clinicIds),
      adminSupabase
        .from('ai_comments')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString()),
    ]);

    const activeClinicCount = clinicsResult.count ?? 0;
    const aiCount = aiResult.count ?? 0;

    const systemStatus: 'operational' | 'degraded' | 'maintenance' =
      'operational';

    const aiAnalysisStatus: 'active' | 'inactive' =
      aiCount > 0 ? 'active' : 'inactive';

    return createSuccessResponse({
      activeClinicCount,
      systemStatus,
      aiAnalysisStatus,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    logError(error, { endpoint: '/api/system/status', userId: auth.id });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
