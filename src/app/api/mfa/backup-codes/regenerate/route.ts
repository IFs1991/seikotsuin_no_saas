/**
 * バックアップコード再生成API
 * Phase 3B: バックアップコード管理
 */

import { NextRequest, NextResponse } from 'next/server';
import { backupCodeManager } from '@/lib/mfa/backup-codes';
import { z } from 'zod';

// リクエストスキーマ
const RegenerateBackupCodesSchema = z.object({
  userId: z.string().min(1, 'ユーザーIDが必要です'),
  adminUserId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // リクエストボディを解析
    const body = await request.json();
    const { userId, adminUserId } = RegenerateBackupCodesSchema.parse(body);

    // バックアップコード再生成
    const newBackupCodes = await backupCodeManager.regenerateBackupCodes(
      userId,
      adminUserId
    );

    return NextResponse.json({
      success: true,
      backupCodes: newBackupCodes,
      count: newBackupCodes.length,
    });
  } catch (error) {
    console.error('バックアップコード再生成エラー:', error);

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
          error instanceof Error
            ? error.message
            : 'バックアップコード再生成に失敗しました',
      },
      { status: 500 }
    );
  }
}
