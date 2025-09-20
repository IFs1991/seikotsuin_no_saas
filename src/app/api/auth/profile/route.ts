import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_ROLES = new Set(['admin', 'clinic_manager', 'manager']);

type ProfileRow = {
  role: string | null;
  clinic_id: string | null;
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

async function fetchProfileRole(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<ProfileRow> {
  const profileQuery = await supabase
    .from('profiles')
    .select('role, clinic_id, is_active')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileQuery.data || !profileQuery.error) {
    return profileQuery.data ?? null;
  }

  const fallbackQuery = await supabase
    .from('profiles')
    .select('role, clinic_id, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (fallbackQuery.data || !fallbackQuery.error) {
    return fallbackQuery.data ?? null;
  }

  return null;
}

export async function GET() {
  try {
    const supabase = createClient();
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

    const profile = await fetchProfileRole(supabase, user.id);

    let role: string | null = profile?.role ?? null;
    let clinicId: string | null = profile?.clinic_id ?? null;
    const isActive = profile?.is_active ?? true;

    if (!role) {
      const permissions = await supabase
        .from('user_permissions')
        .select('role, clinic_id')
        .eq('staff_id', user.id)
        .maybeSingle();

      if (permissions.data) {
        role = permissions.data.role ?? role;
        clinicId = permissions.data.clinic_id ?? clinicId;
      }
    }

    const response: ProfileResponse = {
      id: user.id,
      email: user.email,
      role,
      clinicId,
      isActive: Boolean(isActive),
      isAdmin: role ? ADMIN_ROLES.has(role) : false,
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
