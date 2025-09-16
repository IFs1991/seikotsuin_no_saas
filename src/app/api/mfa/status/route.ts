/**
 * MFA状態取得API
 * Phase 3B: MFA設定状況確認
 */

import { NextRequest, NextResponse } from 'next/server';
import { mfaManager } from '@/lib/mfa/mfa-manager';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'ユーザーIDが必要です' },
        { status: 400 }
      );
    }

    // MFA状態取得
    const mfaStatus = await mfaManager.getMFAStatus(userId);

    return NextResponse.json(mfaStatus);

  } catch (error) {
    console.error('MFA状態取得エラー:', error);

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'MFA状態取得に失敗しました' 
      },
      { status: 500 }
    );
  }
}