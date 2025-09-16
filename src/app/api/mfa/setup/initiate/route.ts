/**
 * MFA設定開始API
 * Phase 3B: MFA設定API実装
 */

import { NextRequest, NextResponse } from 'next/server';
import { mfaManager } from '@/lib/mfa/mfa-manager';
import { z } from 'zod';

// リクエストスキーマ
const InitiateMFASetupSchema = z.object({
  userId: z.string().min(1, 'ユーザーIDが必要です'),
  clinicId: z.string().min(1, 'クリニックIDが必要です'),
});

export async function POST(request: NextRequest) {
  try {
    // リクエストボディを解析
    const body = await request.json();
    const { userId, clinicId } = InitiateMFASetupSchema.parse(body);

    // MFA設定開始
    const setupResult = await mfaManager.initiateMFASetup(userId, clinicId);

    return NextResponse.json(setupResult);

  } catch (error) {
    console.error('MFA設定開始エラー:', error);

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
        error: error instanceof Error ? error.message : 'MFA設定開始に失敗しました' 
      },
      { status: 500 }
    );
  }
}