/**
 * MFA設定開始API
 * Phase 3B: MFA設定API実装
 */

import { NextRequest, NextResponse } from 'next/server';
import { mfaManager } from '@/lib/mfa/mfa-manager';
import { z } from 'zod';
import { createClient } from '@/lib/supabase';

// リクエストスキーマ
const InitiateMFASetupSchema = z.object({
  clinicId: z.string().min(1, 'クリニックIDが必要です').optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // リクエストボディを解析
    const body = await request.json();
    const parsed = InitiateMFASetupSchema.parse(body);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('clinic_id, is_active')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError || !profile || !profile.clinic_id || profile.is_active === false) {
      return NextResponse.json(
        { error: 'プロフィール情報の取得に失敗しました' },
        { status: 403 }
      );
    }

    const clinicId = parsed.clinicId ?? profile.clinic_id;

    // MFA設定開始
    const setupResult = await mfaManager.initiateMFASetup(user.id, clinicId);

    return NextResponse.json(setupResult);
  } catch (error) {
    console.error('MFA設定開始エラー:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: '入力値が無効です',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'MFA設定開始に失敗しました',
      },
      { status: 500 }
    );
  }
}
