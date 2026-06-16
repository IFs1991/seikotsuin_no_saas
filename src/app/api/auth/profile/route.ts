import {
  createAdminClient,
  createClient,
  getUserAccessContext,
} from '@/lib/supabase';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { logPerf, nowMs } from '@/lib/performance/server-timing';

interface ProfileResponse {
  id: string;
  email: string | null;
  role: string | null;
  clinicId: string | null;
  clinicName: string | null;
  isActive: boolean;
  isAdmin: boolean;
}

interface ProfileResponseInput {
  id: string;
  email: string | null;
  role: string | null;
  clinicId: string | null;
  clinicName: string | null;
  isActive: boolean | null;
  isAdmin: boolean;
}

async function fetchClinicName(
  clinicId: string | null
): Promise<string | null> {
  if (!clinicId) {
    return null;
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('clinics')
    .select('name')
    .eq('id', clinicId)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch profile clinic name', error);
    return null;
  }

  return typeof data?.name === 'string' ? data.name : null;
}

function buildProfileResponse(input: ProfileResponseInput): ProfileResponse {
  return {
    id: input.id,
    email: input.email,
    role: input.role,
    clinicId: input.clinicId,
    clinicName: input.clinicName,
    isActive: Boolean(input.isActive),
    isAdmin: input.isAdmin,
  };
}

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
    const role = accessContext.normalizedRole;
    const clinicId = accessContext.clinicId;
    const isActive = accessContext.isActive;
    const tClinic = nowMs();
    const clinicName = await fetchClinicName(clinicId);
    logPerf('auth.profile.fetchClinicName', tClinic, { clinicId });

    const response = buildProfileResponse({
      id: user.id,
      email: user.email ?? null,
      role,
      clinicId,
      clinicName,
      isActive,
      isAdmin: accessContext.isAdmin,
    });

    logPerf('auth.profile.total', tTotal);
    return createSuccessResponse(response);
  } catch (error) {
    console.error('Failed to fetch profile', error);
    return createErrorResponse('プロフィール情報の取得に失敗しました', 500);
  }
}
