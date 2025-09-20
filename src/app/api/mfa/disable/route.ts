/**
 * MFA無効化API
 * Phase 3B: MFA設定解除
 */

import { NextRequest, NextResponse } from 'next/server';
import { mfaManager } from '@/lib/mfa/mfa-manager';
import { z } from 'zod';

// リクエストスキーマ
const DisableMFASchema = z.object({
  userId: z.string().min(1, 'ユーザーIDが必要です'),
  adminUserId: z.string().optional(),
  reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // リクエストボディを解析
    const body = await request.json();
    const { userId, adminUserId, reason } = DisableMFASchema.parse(body);

    // MFA無効化
    const isDisabled = await mfaManager.disableMFA(userId, adminUserId);

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
