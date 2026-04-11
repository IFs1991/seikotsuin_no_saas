import { NextResponse } from 'next/server';
import { createClient, getUserAccessContext } from '@/lib/supabase';

interface ProfileResponse {
  id: string;
  email: string | null;
  role: string | null;
  clinicId: string | null;
  isActive: boolean;
  isAdmin: boolean;
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

    const accessContext = await getUserAccessContext(user.id, supabase);
    const role = accessContext.normalizedRole;
    const clinicId = accessContext.clinicId;
    const isActive = accessContext.isActive;

    // Q4決定: isAdmin に manager を含める（統一）
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    const response: ProfileResponse = {
      id: user.id,
      email: user.email ?? null,
      role,
      clinicId,
      isActive: Boolean(isActive),
      isAdmin: accessContext.isAdmin,
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
