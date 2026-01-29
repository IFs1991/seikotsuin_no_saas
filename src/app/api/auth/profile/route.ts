import { NextResponse } from 'next/server';
import {
  createClient,
  getUserPermissions,
  type SupabaseServerClient,
} from '@/lib/supabase';
import {
  canManageClinicSettingsWithCompat,
  normalizeRole,
} from '@/lib/constants/roles';

type ProfileStatusRow = {
  is_active: boolean | null;
} | null;

interface ProfileResponse {
  id: string;
  email: string | null;
  role: string | null;
  clinicId: string | null;
  isActive: boolean;
  isAdmin: boolean;
}

async function fetchProfileStatus(
  supabase: SupabaseServerClient,
  userId: string
): Promise<ProfileStatusRow> {
  const profileQuery = await supabase
    .from('profiles')
    .select('is_active')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileQuery.data || !profileQuery.error) {
    return profileQuery.data ?? null;
  }

  const fallbackQuery = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', userId)
    .maybeSingle();

  if (fallbackQuery.data || !fallbackQuery.error) {
    return fallbackQuery.data ?? null;
  }

  return null;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const permissions = await getUserPermissions(user.id, supabase);
    const profileStatus = await fetchProfileStatus(supabase, user.id);

    // 互換マッピング適用: clinic_manager → clinic_admin
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (Option B-1)
    const rawRole = permissions?.role ?? null;
    const role = normalizeRole(rawRole);
    const clinicId = permissions?.clinic_id ?? null;
    const isActive = profileStatus?.is_active ?? true;

    // Q4決定: isAdmin に manager を含める（統一）
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    const response: ProfileResponse = {
      id: user.id,
      email: user.email ?? null,
      role,
      clinicId,
      isActive: Boolean(isActive),
      isAdmin: canManageClinicSettingsWithCompat(role),
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    console.error('Failed to fetch profile', error);
    return NextResponse.json(
      { success: false, error: 'プロフィール情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}
