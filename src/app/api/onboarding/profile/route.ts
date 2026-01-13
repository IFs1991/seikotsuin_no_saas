/**
 * POST /api/onboarding/profile
 *
 * Step 1: 管理者基本情報を更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getCurrentUser } from '@/lib/supabase/server';
import { profileUpdateSchema } from '../schema';

export async function POST(request: NextRequest) {
  try {
    const supabase = await getServerClient();
    const user = await getCurrentUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    // リクエストボディを取得
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: '無効なJSONデータです' },
        { status: 400 }
      );
    }

    // バリデーション
    const parsed = profileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: '入力値にエラーがあります',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { full_name, phone_number } = parsed.data;

    // プロフィール更新
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name,
        phone_number: phone_number ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (profileError) {
      console.error('Profile update error:', profileError);
      return NextResponse.json(
        { success: false, error: 'プロフィールの更新に失敗しました' },
        { status: 500 }
      );
    }

    // オンボーディング状態を更新
    const { error: stateError } = await supabase
      .from('onboarding_states')
      .upsert(
        {
          user_id: user.id,
          current_step: 'clinic',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (stateError) {
      console.error('Onboarding state update error:', stateError);
      // 状態更新失敗はログのみ（プロフィール更新は成功しているため）
    }

    return NextResponse.json({
      success: true,
      data: { next_step: 'clinic' },
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json(
      { success: false, error: 'プロフィールの更新に失敗しました' },
      { status: 500 }
    );
  }
}
