import { createClient, getUserAccessContext } from '@/lib/supabase';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { logPerf, nowMs } from '@/lib/performance/server-timing';
import {
  buildProfileResponse,
  fetchClinicName,
} from '@/lib/auth/profile-read-model';
import { AppError } from '@/lib/error-handler';

const ACCOUNT_INACTIVE_MESSAGE =
  'アカウントが無効化されています。管理者にお問い合わせください';
const AUTHORITY_UNAVAILABLE_MESSAGE =
  '認証情報を確認できません。時間をおいて再度お試しください';

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

    if (!accessContext.isActive) {
      return createErrorResponse(ACCOUNT_INACTIVE_MESSAGE, 403);
    }

    if (!accessContext.permissions) {
      return createErrorResponse('アクセス権限がありません', 403);
    }

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
    if (error instanceof AppError && error.statusCode === 503) {
      return createErrorResponse(AUTHORITY_UNAVAILABLE_MESSAGE, 503);
    }

    console.error('Failed to fetch profile', error);
    return createErrorResponse('プロフィール情報の取得に失敗しました', 500);
  }
}
