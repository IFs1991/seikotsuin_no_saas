import { createClient, getUserAccessContext } from '@/lib/supabase';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { logPerf, nowMs } from '@/lib/performance/server-timing';
import {
  buildProfileResponse,
  fetchClinicName,
} from '@/lib/auth/profile-read-model';

export async function GET() {
  try {
    const tTotal = nowMs();
    const supabase = await createClient();
    const tAuth = nowMs();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    logPerf('auth.profile.getUser', tAuth);

    if (authError || !user) {
      return createErrorResponse('認証が必要です', 401);
    }

    const tAccess = nowMs();
    const accessContext = await getUserAccessContext(user.id, supabase, {
      user,
    });
    logPerf('auth.profile.getUserAccessContext', tAccess);
    const clinicId = accessContext.clinicId;
    const tClinic = nowMs();
    const clinicName = await fetchClinicName(clinicId);
    logPerf('auth.profile.fetchClinicName', tClinic, { clinicId });

    const response = buildProfileResponse({
      user,
      accessContext,
      clinicName,
    });

    logPerf('auth.profile.total', tTotal);
    return createSuccessResponse(response);
  } catch (error) {
    console.error('Failed to fetch profile', error);
    return createErrorResponse('プロフィール情報の取得に失敗しました', 500);
  }
}
