/**
 * MFA状態取得API
 * Phase 3B: MFA設定状況確認
 */

import { NextRequest, NextResponse } from 'next/server';
import { mfaManager } from '@/lib/mfa/mfa-manager';
import { createClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // MFA状態取得
    const mfaStatus = await mfaManager.getMFAStatus(user.id);

    return NextResponse.json(mfaStatus);
  } catch (error) {
    console.error('MFA状態取得エラー:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'MFA状態取得に失敗しました',
      },
      { status: 500 }
    );
  }
}
