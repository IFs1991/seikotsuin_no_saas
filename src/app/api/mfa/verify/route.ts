/**
 * MFA認証検証API
 * Phase 3B: TOTP・バックアップコード検証
 */

import { NextRequest, NextResponse } from 'next/server';
import { mfaManager } from '@/lib/mfa/mfa-manager';
import { backupCodeManager } from '@/lib/mfa/backup-codes';
import { z } from 'zod';
import { createClient } from '@/lib/supabase';

// リクエストスキーマ
const VerifyMFASchema = z.object({
  type: z.enum(['totp', 'backup'], {
    errorMap: () => ({ message: '認証タイプが無効です' }),
  }),
  code: z.string().min(1, '認証コードが必要です'),
  window: z.number().min(1).max(4).optional().default(1),
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
    const { type, code, window } = VerifyMFASchema.parse(body);

    let isValid = false;
    let additionalInfo = {};

    if (type === 'totp') {
      // TOTP認証検証
      if (code.length !== 6 || !/^\d{6}$/.test(code)) {
        return NextResponse.json(
          { error: 'TOTPコードは6桁の数字である必要があります' },
          { status: 400 }
        );
      }

      isValid = await mfaManager.verifyTOTP(user.id, code, window);
    } else if (type === 'backup') {
      // バックアップコード検証
      if (code.length !== 8) {
        return NextResponse.json(
          { error: 'バックアップコードは8桁である必要があります' },
          { status: 400 }
        );
      }

      const backupResult = await backupCodeManager.verifyAndMarkBackupCode(
        user.id,
        code
      );
      isValid = backupResult.isValid;
      additionalInfo = {
        remainingCodes: backupResult.remainingCodes,
        warningLevel: backupResult.warningLevel,
      };
    }

    return NextResponse.json({
      isValid,
      ...additionalInfo,
    });
  } catch (error) {
    console.error('MFA認証検証エラー:', error);

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
          error instanceof Error ? error.message : 'MFA認証検証に失敗しました',
      },
      { status: 500 }
    );
  }
}
