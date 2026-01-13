/**
 * GET /api/onboarding/status
 *
 * オンボーディング進捗状態を取得
 */

import { NextResponse } from 'next/server';
import { getServerClient, getCurrentUser } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await getServerClient();
    const user = await getCurrentUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    // オンボーディング状態を取得
    const { data: state, error } = await supabase
      .from('onboarding_states')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Onboarding status error:', error);
      return NextResponse.json(
        { success: false, error: 'オンボーディング状態の取得に失敗しました' },
        { status: 500 }
      );
    }

    // 状態がない場合は初期状態を返す
    if (!state) {
      return NextResponse.json({
        success: true,
        data: {
          current_step: 'profile',
          completed: false,
          clinic_id: null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        current_step: state.current_step,
        completed: state.completed_at !== null,
        clinic_id: state.clinic_id,
        metadata: state.metadata,
      },
    });
  } catch (error) {
    console.error('Onboarding status error:', error);
    return NextResponse.json(
      { success: false, error: 'オンボーディング状態の取得に失敗しました' },
      { status: 500 }
    );
  }
}
