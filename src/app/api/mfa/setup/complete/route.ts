/**
 * MFA設定完了API
 * Phase 3B: TOTP検証・設定完了
 */

import { NextRequest, NextResponse } from 'next/server';
import { mfaManager } from '@/lib/mfa/mfa-manager';
import { z } from 'zod';
import { createClient } from '@/lib/supabase';

// リクエストスキーマ
const CompleteMFASetupSchema = z.object({
  token: z.string().length(6, 'TOTPトークンは6桁である必要があります'),
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
    const { token } = CompleteMFASetupSchema.parse(body);

    // MFA設定完了
    const isCompleted = await mfaManager.completeMFASetup(user.id, token);

    if (!isCompleted) {
      return NextResponse.json(
        { error: 'TOTPトークンの検証に失敗しました' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('MFA設定完了エラー:', error);

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
          error instanceof Error ? error.message : 'MFA設定完了に失敗しました',
      },
      { status: 500 }
    );
  }
}
