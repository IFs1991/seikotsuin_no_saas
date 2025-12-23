/**
 * バックアップコード再生成API
 * Phase 3B: バックアップコード管理
 */

import { NextRequest, NextResponse } from 'next/server';
import { backupCodeManager } from '@/lib/mfa/backup-codes';
import { z } from 'zod';
import { createClient } from '@/lib/supabase';

// リクエストスキーマ
const RegenerateBackupCodesSchema = z.object({
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
    RegenerateBackupCodesSchema.parse(body);

    // バックアップコード再生成
    const newBackupCodes = await backupCodeManager.regenerateBackupCodes(
      user.id,
      user.id
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
