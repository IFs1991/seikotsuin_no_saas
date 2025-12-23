/**
 * バックアップコード使用状況取得API
 * Phase 3B: バックアップコード統計
 */

import { NextRequest, NextResponse } from 'next/server';
import { backupCodeManager } from '@/lib/mfa/backup-codes';
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

    // バックアップコード使用状況取得
    const usage = await backupCodeManager.getBackupCodeUsage(user.id);

    return NextResponse.json(usage);
  } catch (error) {
    console.error('バックアップコード使用状況取得エラー:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'バックアップコード使用状況取得に失敗しました',
      },
      { status: 500 }
    );
  }
}
