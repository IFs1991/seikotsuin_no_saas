/**
 * MFA設定完了API
 * Phase 3B: TOTP検証・設定完了
 */

import { NextRequest, NextResponse } from 'next/server';
import { mfaManager } from '@/lib/mfa/mfa-manager';
import { z } from 'zod';

// リクエストスキーマ
const CompleteMFASetupSchema = z.object({
  userId: z.string().min(1, 'ユーザーIDが必要です'),
  token: z.string().length(6, 'TOTPトークンは6桁である必要があります'),
});

export async function POST(request: NextRequest) {
  try {
    // リクエストボディを解析
    const body = await request.json();
    const { userId, token } = CompleteMFASetupSchema.parse(body);

    // MFA設定完了
    const isCompleted = await mfaManager.completeMFASetup(userId, token);

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
          details: error.errors 
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'MFA設定完了に失敗しました' 
      },
      { status: 500 }
    );
  }
}