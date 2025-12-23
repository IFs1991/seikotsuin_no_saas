/**
 * MFA無効化API
 * Phase 3B: MFA設定解除
 */

import { NextRequest, NextResponse } from 'next/server';
import { mfaManager } from '@/lib/mfa/mfa-manager';
import { z } from 'zod';
import { createClient } from '@/lib/supabase';

// リクエストスキーマ
const DisableMFASchema = z.object({
  reason: z.string().optional(),
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
    const { reason } = DisableMFASchema.parse(body);

    // MFA無効化
    const isDisabled = await mfaManager.disableMFA(user.id, user.id);

    if (!isDisabled) {
      return NextResponse.json(
        { error: 'MFA無効化に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'MFAが無効化されました',
    });
  } catch (error) {
    console.error('MFA無効化エラー:', error);

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
          error instanceof Error ? error.message : 'MFA無効化に失敗しました',
      },
      { status: 500 }
    );
  }
}
