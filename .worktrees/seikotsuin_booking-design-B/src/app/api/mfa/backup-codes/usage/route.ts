/**
 * バックアップコード使用状況取得API
 * Phase 3B: バックアップコード統計
 */

import { NextRequest, NextResponse } from 'next/server';
import { backupCodeManager } from '@/lib/mfa/backup-codes';

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

    // バックアップコード使用状況取得
    const usage = await backupCodeManager.getBackupCodeUsage(userId);

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
