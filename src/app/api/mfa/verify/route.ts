/**
 * MFA認証検証API
 * Phase 3B: TOTP・バックアップコード検証
 */

import { NextRequest, NextResponse } from 'next/server';
import { mfaManager } from '@/lib/mfa/mfa-manager';
import { backupCodeManager } from '@/lib/mfa/backup-codes';
import { z } from 'zod';
import { createErrorResponse, processApiRequest } from '@/lib/api-helpers';
import { createLogger } from '@/lib/logger';

const log = createLogger('MFAVerifyRoute');

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
    const result = await processApiRequest(request, { requireBody: true });
    if (!result.success) {
      return result.error;
    }

    const parsed = VerifyMFASchema.safeParse(result.body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値が無効です',
        400,
        parsed.error.flatten()
      );
    }
    const { type, code, window } = parsed.data;

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

      isValid = await mfaManager.verifyTOTP(result.auth.id, code, window);
    } else if (type === 'backup') {
      // バックアップコード検証
      if (code.length !== 8) {
        return NextResponse.json(
          { error: 'バックアップコードは8桁である必要があります' },
          { status: 400 }
        );
      }

      const backupResult = await backupCodeManager.verifyAndMarkBackupCode(
        result.auth.id,
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
    log.error('MFA認証検証エラー:', error);

    return createErrorResponse('MFA認証検証に失敗しました', 500);
  }
}
