import { NextRequest } from 'next/server';
import {
  processApiRequest,
  createSuccessResponse,
  createErrorResponse,
  logError,
} from '@/lib/api-helpers';
import { createAdminClient, resolveScopedClinicIds } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const result = await processApiRequest(request);

  if (!result.success) {
    return result.error;
  }

  const { auth, permissions } = result;

  const clinicIds = resolveScopedClinicIds(permissions);

  if (!clinicIds || clinicIds.length === 0) {
    return createErrorResponse('院へのアクセス権がありません', 403);
  }

  try {
    const adminSupabase = createAdminClient();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Dependency query failures produce a degraded state. A future incident
    // source may add an explicit maintenance state without changing this gate.
    const [clinicsResult, aiResult] = await Promise.all([
      adminSupabase
        .from('clinics')
        .select('*', { count: 'exact', head: true })
        .in('id', clinicIds),
      adminSupabase
        .from('ai_comments')
        .select('*', { count: 'exact', head: true })
        .in('clinic_id', clinicIds)
        .gte('created_at', todayStart.toISOString()),
    ]);

    const activeClinicCount = clinicsResult.error
      ? 0
      : (clinicsResult.count ?? 0);
    const aiCount = aiResult.error ? 0 : (aiResult.count ?? 0);

    const systemStatus: 'operational' | 'degraded' =
      clinicsResult.error || aiResult.error ? 'degraded' : 'operational';

    if (clinicsResult.error || aiResult.error) {
      logError(new Error('System status dependency query failed'), {
        endpoint: '/api/system/status',
        userId: auth.id,
      });
    }

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
